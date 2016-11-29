
var Promise = require('bluebird');

module.exports = exports = function promiseQuery (query) {
	if (!query) return Promise.reject(new Error('Did not get a query object'));
	if (!query.connection || !query.connection.query) return Promise.reject('Did not get a connection to perform the query on.');
	if (query.prepared && !query.connection.execute) return Promise.reject('Cannot perform a prepared query on the passed connection.');

	var tracer;
	if (query.tidyStacks) {
		tracer = new Error();
	}

	var method = Promise.promisify(
		query.prepared ? query.connection.execute : query.connection.query,
		{ context: query.connection, multiArgs: true }
	);

	var retries = query.retry ? query.retryCount : 0;
	function tryQuery () {
		return method(query, query.values)
			.catch((err) => {
				if (!err.fatal && retries > 0) {
					retries--;
					return tryQuery();
				}

				if (query.tidyStacks) {
					err = cleanupError(err, tracer);
				}

				err.query = {
					sql:      query.sql,
					values:   query.values,
					prepared: query.prepared,
					retryCount:  query.retryCount,
				};

				return Promise.reject(err);
			});
	}

	return tryQuery();
};

function cleanupError (err, tracer) {
	var oldStack = err.originalStack = err.stack;

	var stack = tracer.stack.split('\n');
	var firstLine = oldStack.match(/^(.+)\n/);
	if (firstLine && firstLine[1]) {
		stack[0] = firstLine[1];
	} else {
		stack[0] = 'Error: ' + err.message;
	}

	err.stack = stack.join('\n');

	return err;
}
