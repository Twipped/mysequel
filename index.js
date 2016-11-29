
var Emitter = require('events').EventEmitter;
var queries = require('./lib/queries');
var mysql   = require('mysql2');
var Promise = require('bluebird');
var promiseQuery        = require('./lib/promise-query');
var pingIdleConnections = require('./lib/ping');
var merge = require('lodash.merge');

module.exports = exports = function makeQuint (options) {
	options = merge({
		prepared: true,
		namedPlaceholders: true,
		transactionAutoRollback: true,
		retry: true,
		retryCount: 2,
		tidyStacks: true,
		connectionBootstrap: null,
		ping: {
			frequency: 30000,
			query: 'SELECT 1+1 as two;',
			expectedResult: [ { two: 2 } ],
		},
	}, options);

	var pool;
	var pingTimer;
	var quint = new Emitter();

	quint._quint = 'pool';

	quint.options = options;

	quint.getPool = () => {
		if (pool) return pool;

		pool = mysql.createPool(options);
		pool.on('connection', (connection) => {
			if (Array.isArray(options.connectionBootstrap)) {
				var bootstrap = Promise.each(
					options.connectionBootstrap,
					(q) => promiseQuery(Object.assign({ connection, prepared: false, retry: false }, q))
				);

				connection.isReady = bootstrap.then(
					() => connection,
					(err) => {
						// if bootstrap fails, remove the connection from the pool
						// and re-throw the error
						connection.destroy();
						throw err;
					}
				);

				connection.isReady.then(
					() => quint.emit('connection-ready', connection),
					() => null // absorb exceptions so we don't get an unhandled rejection from this tail
				);

				quint.emit('connection', connection);
			} else {
				quint.emit('connection', connection);
				quint.emit('connection-ready', connection);
			}
		});

		if (options.ping && typeof options.ping === 'object' && options.ping.frequency) {
			pingTimer = setInterval(() => pingIdleConnections(pool, options).then((removed) => {
				removed.forEach((err) => quint.emit('connection-ping-out', err));
			}), options.ping.frequency);
		}

		return pool;
	};

	quint.getRawConnection = function getRawConnection () {
		return Promise.fromCallback((cb) => quint.getPool().getConnection(cb))
			.then((c) => c.isReady || c);
	};

	quint.getDisposedRawConnection = function getRawConnection () {
		return quint.getRawConnection().disposer((connection) => connection.release());
	};

	quint.close = () => {
		quint.emit('closing');

		if (!pool) return Promise.resolve();

		if (pingTimer) {
			clearInterval(pingTimer);
			pingTimer = false;
		}

		return Promise.fromCallback(function fromCallback (callback) {
			pool.end(callback);
			pool = null;
		})
		.then(function done () {
			quint.emit('closed');
		});
	};

	Object.keys(queries).forEach((key) => {
		var time = Date.now();
		var fn = queries[key];

		quint[key] = (sql, values, opts) => {
			var query = typeof sql === 'object' ? sql : { sql, values };

			query = Object.assign({
				prepared: options.prepared,
				namedPlaceholders: options.namedPlaceholders,
				retry: options.retry,
				retryCount: options.retryCount,
				tidyStacks: options.tidyStacks,
				connection: null,
			}, query, opts || {});

			quint.emit('query-start', key, query);

			return Promise.using(query.connection || quint.getDisposedRawConnection(), (connection) => {
				query.connection = connection;
				return fn(query)
					.then(
						(result) => {
							quint.emit('query-complete', key, query, Date.now() - time);
							return result;
						},
						(err) => {
							quint.emit('query-error', err, key, query, Date.now() - time);
							throw err;
						}
					);
			});
		};
	});

	quint.queryStream = (sql, values, opts) => {
		var query = typeof sql === 'object' ? sql : { sql, values };

		query = Object.assign({
			namedPlaceholders: options.namedPlaceholders,
			connection: null,
		}, query, opts || {});

		if (!query.connection) {
			query.connection = quint.getPool();
		}

		return query.connection.query(query, query.values);
	};

	quint.getConnection = (cOptions) => {
		cOptions = Object.assign({
			prepared: options.prepared,
			namedPlaceholders: options.namedPlaceholders,
			transactionAutoRollback: options.transactionAutoRollback,
			tidyStacks: options.tidyStacks,
			connection: null,
		}, cOptions);

		return Promise.resolve(cOptions.connection || quint.getRawConnection()).then((connection) => {
			var open = true;

			var connectionWrapper = {
				_quint: 'connection',

				release (passthru) {
					open = false;
					connection.release();
					return passthru;
				},

				destroy (passthru) {
					open = false;
					connection.destroy();
					return passthru;
				},

				get isOpen () {
					return open;
				},

				get rawConnection () {
					return connection;
				},
			};

			Object.keys(queries).forEach((key) => {
				var time = Date.now();
				var fn = queries[key];

				connectionWrapper[key] = (sql, values, opts) => {
					var query = typeof sql === 'object' ? sql : { sql, values };

					query = Object.assign({
						prepared: cOptions.prepared,
						namedPlaceholders: cOptions.namedPlaceholders,
						transactionAutoRollback: cOptions.transactionAutoRollback,
						tidyStacks: cOptions.tidyStacks,
					}, query, opts || {}, {
						retry: false,
						retryCount: 0,
						connection,
					});

					quint.emit('query-start', key, query);

					return fn(query)
						.then(
							(result) => {
								quint.emit('query-complete', key, query, Date.now() - time);
								return result;
							},
							(err) => {
								quint.emit('query-error', err, key, query, Date.now() - time);
								return Promise.reject(err);
							}
						);
				};
			});

			connectionWrapper.queryStream = (sql, values, opts) => {
				var query = typeof sql === 'object' ? sql : { sql, values };

				query = Object.assign({
					namedPlaceholders: options.namedPlaceholders,
				}, query, opts || {});

				return connection.query(query, query.values);
			};

			return connectionWrapper;
		});
	};

	quint.transaction = (tOptions) => {
		tOptions = Object.assign({
			prepared: options.prepared,
			namedPlaceholders: options.namedPlaceholders,
			transactionAutoRollback: options.transactionAutoRollback,
			tidyStacks: options.tidyStacks,
			connection: null,
		}, tOptions);

		function start () {
			return quint.getConnection(tOptions)
				.then((connection) =>
					Promise.fromCallback((cb) => connection.rawConnection.beginTransaction(cb))
						.then(() => connection));
		}

		return start().then((connection) => {
			var rawC = connection.rawConnection;
			var commit = Promise.promisify(rawC.commit, { context: rawC });
			var rollback = Promise.promisify(rawC.rollback, { context: rawC });

			var transaction = Object.create(connection);

			transaction.commit = (passthru) => {
				if (!connection.isOpen) return Promise.reject(new Error('Cannot commit a finished transaction.'));

				return commit().then(() => {
					connection.release();
					return passthru;
				});
			};

			transaction.rollback = (passthru) => {
				if (!connection.isOpen) return Promise.reject(new Error('Cannot rollback a finished transaction.'));

				return rollback().then(() => {
					connection.release();
					return passthru;
				});
			};

			// transactions cannot be released, only committed or rolled back
			transaction.release = undefined;

			Object.keys(queries).forEach((key) => {
				transaction[key] = (sql, values, opts) => {
					var query = typeof sql === 'object' ? sql : { sql, values };

					query = Object.assign({
						prepared: tOptions.prepared,
						namedPlaceholders: tOptions.namedPlaceholders,
						transactionAutoRollback: tOptions.transactionAutoRollback,
						tidyStacks: tOptions.tidyStacks,
					}, query, opts || {}, {
						retry: false,
						retryCount: 0,
						connection,
					});

					return connection[key](query).catch((err) => {
						// if a query failed but the connection did not close,
						// rollback the transaction automatically
						if (!err.fatal && query.transactionAutoRollback) {
							return transaction.rollback()
								.then(() => Promise.reject(err));
						} else if (err.fatal) {
							transaction.destroy();
						}

						return Promise.reject(err);
					});
				};
			});

			return transaction;
		});
	};

	return quint;
};

