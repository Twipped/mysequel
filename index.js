
var Emitter = require('events').EventEmitter;
var queries = require('./lib/queries');
var mysql   = require('mysql2');
var Promise = require('bluebird');
var promiseQuery        = require('./lib/promise-query');
var pingIdleConnections = require('./lib/ping');
var merge = require('./lib/utils').merge;

module.exports = exports = function makeMySequel (options) {
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

	var mysqlOptions = {};
	var omit = [
		'prepared',
		'transactionAutoRollback',
		'retry',
		'retryCount',
		'tidyStacks',
		'connectionBootstrap',
		'ping',
	];

	// copy anything that isn't ours into the mysql2 options object
	Object.keys(options)
		.filter((k) => omit.indexOf(k) === -1)
		.forEach((k) => { mysqlOptions[k] = options[k]; });

	var pool, pingTimer;
	var mysequel = new Emitter();

	mysequel._mysequel = 'pool';

	mysequel.options = options;

	mysequel.getPool = () => {
		if (pool) return pool;

		pool = mysql.createPool(mysqlOptions);
		pool.on('connection', (connection) => {
			if (Array.isArray(options.connectionBootstrap)) {
				var bootstrap = Promise.each(
					options.connectionBootstrap,
					(q) => promiseQuery(Object.assign(q, null, { connection, prepared: false, retry: false })),
				);

				connection.isReady = bootstrap.then(
					() => connection,
					(err) => {
						// if bootstrap fails, remove the connection from the pool
						// and re-throw the error
						connection.destroy();
						throw err;
					},
				);

				connection.isReady.then(
					() => mysequel.emit('connection-ready', connection),
					() => null, // absorb exceptions so we don't get an unhandled rejection from this tail
				);

				mysequel.emit('connection', connection);
			} else {
				mysequel.emit('connection', connection);
				mysequel.emit('connection-ready', connection);
			}
		});

		if (options.ping && typeof options.ping === 'object' && options.ping.frequency) {
			pingTimer = setInterval(() => pingIdleConnections(pool, options).then((removed) => {
				removed.forEach((err) => mysequel.emit('connection-ping-out', err));
			}), options.ping.frequency);
		}

		return pool;
	};

	mysequel.getRawConnection = function getRawConnection () {
		return Promise.fromCallback((cb) => mysequel.getPool().getConnection(cb))
			.then((c) => c.isReady || c);
	};

	mysequel.getDisposedRawConnection = function getRawConnection () {
		return mysequel.getRawConnection().disposer((connection) => connection.release());
	};

	mysequel.close = () => {
		mysequel.emit('closing');

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
				mysequel.emit('closed');
			});
	};

	Object.keys(queries).forEach((key) => {
		var fn = queries[key];

		mysequel[key] = (sql, values, opts) => {
			var time = Date.now();
			var query = typeof sql === 'object' ? sql : { sql, values };

			query = Object.assign({
				prepared: options.prepared,
				namedPlaceholders: options.namedPlaceholders,
				retry: options.retry,
				retryCount: options.retryCount,
				tidyStacks: options.tidyStacks,
				connection: null,
			}, query, opts || {});

			if (query.connection) {
				query.retry = false;
			}

			mysequel.emit('query-start', key, query);

			var retries = query.retry ? query.retryCount : 0;
			function tryQuery () {
				return Promise.using(query.connection || mysequel.getDisposedRawConnection(), (connection) => {
					var q = Object.create(query);
					q.connection = connection;

					return fn(q);
				}).catch((err) => {
					if (err.fatal && retries > 0) {
						retries--;
						mysequel.emit('query-retry', err, key, query, Date.now() - time);
						return tryQuery();
					}

					throw err;
				});
			}

			return tryQuery().then(
				(result) => {
					mysequel.emit('query-success', key, query, Date.now() - time);
					mysequel.emit('query-done', null, key, query, Date.now() - time);
					return result;
				},
				(err) => {
					mysequel.emit('query-error', err, key, query, Date.now() - time);
					mysequel.emit('query-done', err, key, query, Date.now() - time);
					throw err;
				},
			);

		};
	});

	mysequel.queryStream = (sql, values, opts) => {
		var query = typeof sql === 'object' ? sql : { sql, values };

		query = Object.assign({
			namedPlaceholders: options.namedPlaceholders,
			connection: null,
		}, query, opts || {});

		if (!query.connection) {
			query.connection = mysequel.getPool();
		}

		return query.connection.query(query, query.values);
	};

	mysequel.getConnection = (cOptions) => {
		cOptions = Object.assign({
			prepared: options.prepared,
			namedPlaceholders: options.namedPlaceholders,
			transactionAutoRollback: options.transactionAutoRollback,
			tidyStacks: options.tidyStacks,
			connection: null,
		}, cOptions);

		return Promise.resolve(cOptions.connection || mysequel.getRawConnection()).then((connection) => {
			var open = true;

			var connectionWrapper = {
				_mysequel: 'connection',

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
						connection,
					});

					mysequel.emit('query-start', key, query);

					return fn(query)
						.then(
							(result) => {
								mysequel.emit('query-success', key, query, Date.now() - time);
								mysequel.emit('query-done', null, key, query, Date.now() - time);
								return result;
							},
							(err) => {
								mysequel.emit('query-error', err, key, query, Date.now() - time);
								mysequel.emit('query-done', err, key, query, Date.now() - time);
								throw err;
							},
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

	mysequel.transaction = (tOptions) => {
		tOptions = Object.assign({
			prepared: options.prepared,
			namedPlaceholders: options.namedPlaceholders,
			transactionAutoRollback: options.transactionAutoRollback,
			tidyStacks: options.tidyStacks,
			connection: null,
		}, tOptions);

		function start () {
			return mysequel.getConnection(tOptions)
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

						throw err;
					});
				};
			});

			return transaction;
		});
	};

	return mysequel;
};

