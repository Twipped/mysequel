#quint

A best-practices abstraction of [node-mysql2](http://npm.im/mysql2).

[![NPM version](https://img.shields.io/npm/v/quint.svg)](http://badge.fury.io/js/quint)
[![Licensed MIT](https://img.shields.io/npm/l/quint.svg)](https://github.com/ChiperSoft/quint/blob/master/LICENSE.txt)
[![Nodejs 4+](https://img.shields.io/badge/node.js-%3E=_4 LTS-brightgreen.svg)](http://nodejs.org)
[![Downloads](http://img.shields.io/npm/dm/quint.svg)](http://npmjs.org/quint)
[![Build Status](https://img.shields.io/travis/ChiperSoft/quint.svg)](https://travis-ci.org/ChiperSoft/quint)

## What Quint provides over using node-mysql or mysql2 Pools directly:

_Please note that the below is NOT a criticism of the excellent work put forward by [Felix Geisendörfer](https://github.com/felixge), [Doug Wilson](https://github.com/dougwilson) and [Andrey Sidorov](https://github.com/sidorares), for whom this library would not be possible without._

1. **Promises**   
   While mysql2 provides a promise wrapper of its own, it is surface level only and actually makes it harder to work with connections and pools directly. The mysql2 wrapper also does not extend its coverage to transactions, which Quint provides.

2. **Connection Bootstrapping**   
   Sometimes an application needs to be able to perform some commands against every new connection before that connection can be used for querying (eg, connection settings). While it is possible to execute queries against a connection immediately on creation, there is no assurance that those queries will fire before the query that triggered the creation of the connection. Quint always waits for bootstrap queries to finish before using a connection.

3. **Shortcut Queries**   
   If a query is only returning a single row, single column, or a single column within a single row, it can be convenient to directly query those values. Quint provides `queryRow`, `queryColumn` and `queryCell` for just such situations. `queryInsert` is also provided for when all you want back is an auto-incremented id.

4. **Connection Pinging**   
   Anyone who has used node-mysql or mysql2 in production knows the pains when the database server hangs up and the pool doesn't notice it to remove those dead connections. Quint automatically pings all idle connections in the pool every 30 seconds to ensure that no stale connections can remain around.

5. **Query Retry on Connection Failure**   
   If connection pinging fails to catch a dead connection in time, Quint will automatically retry any queries that fail due to a connection error.

6. **Usable stack traces**   
   Due to the internal structure of mysql2, stack traces produced by query errors never point at the query which caused the error. Quint replaces these unusable stack traces with a trace leading to the originating caller.

7. **Debug & Logging hooks**   
   Quint pools provide event emitter hooks for query and connection life-cycles, allowing for logging of all queries performed.

8. **Sensible Defaults**   
   Unless overridden, Quint always performs queries as prepared statements (which makes repeat queries faster) with named parameters turned on (which lets queries be easier to read and write).

## Installation

NPM: `npm install quint`

## Usage

- `pool = quint(config)` - Takes a configuration object and returns a Quint pool wrapper. Note, no connection is opened until a query is performed.

- `mysql2Pool = pool.getPool()` - Returns the raw mysql2 Pool object used internally. If the pool has not yet been initialized by a query request, this does so.

- `pool.getConnection() => connection` - Returns a promise that resolves with an active connection *after* any bootstrap queries have completed. Note, you must call `connection.release()` once you are finished with this connection to allow it to return to the pool.

- `pool.getDisposedConnection() => connection` - Returns a [Bluebird Disposer](http://bluebirdjs.com/docs/api/disposer.html) for a connection, which automatically releases the connection after usage. See [Promise.using()](http://bluebirdjs.com/docs/api/promise.using.html) for more details.

- `pool.getRawConnection()` && `pool.getDisposedRawConnection()` - Same as above, but resolves with the mysql Connection object instead of a Quint connection.

- `pool.close() => null` - Returns a promise that resolves after all pending queries have completed and all connections in the pool have terminated.

### Transactions

- `pool.transaction([options]) => transaction` - Returns a promise that resolves with a transaction object after a connection has been retrieved and a transaction started.

- `transaction.commit([passthru]) => passthru` - Returns a promise that resolves with the provided value after the connection has committed.

- `transaction.rollback([passthru]) => passthru` - Returns a promise that resolves with the provided value after the connection has rolled back.

- `transaction.isActive` - Boolean property which identifies if the transaction is still open.

### Query Functions

The following functions may be called either from the pool, from a connection, or from a transaction.

- `.query(sql, [values], [options])` - Returns a promise which resolves with the full results of the query operation as generated by mysql2 (an array with extra data attached).

- `.queryRow(sql, [values], [options])` - Returns a promise which resolves with the first row of the results, or null if no results are returned.

- `.queryColumn(sql, [values], [options])` - Returns a promise which resolves with an array containing the first cell of every row in the results, regardless of the column's name, or an empty array.

- `.queryCell(sql, [values], [options])` - Returns a promise which resolves with the first cell of the first row, or null if no results are returned.

- `.queryInsert(sql, [values], [options])` - Returns a promise which resolves with the auto-increment ID generated by an `INSERT` query.

- `.queryChanged(sql, [values], [options])` - Returns a promise which resolves with the number of rows changed by an `UPDATE` or `DELETE` query.

- `.queryAffected(sql, [values], [options])` - Returns a promise which resolves with the number of rows affected (including rows left unchanged) by an `UPDATE` or `DELETE` query.

- `.queryStream(sql, [values], [options])` - Returns a mysql2 Query object which can then be hooked into for streamed results. [See the node-mysql documentation for more details](https://github.com/mysqljs/mysql#streaming-query-rows). Note: Streamed queries ignore the `prepared` option and always execute as plain queries.

All query functions may receive 2-3 arguments with an SQL string, array or object of query parameters, and an optional options object. The options object may contain any non-connection related configuration options (such as `prepared` and `retry`) to override pool-level settings. Alternatively you may also pass a single argument, an options object with the `sql` and `values` properties, like so:

```js
pool.query({
	sql: 'SELECT * FROM users LIMIT :limit',
	values: { limit: 10 },
	retry: false
})
```

## Example Recommended Usage

Create a module that represents your database:

```js
// mysql.js
var quint = require('quint');
var config = require('your/config/library');
var log = require('your/logging/library');

var mysql = quint(config.mysql);
mysql.on('query-complete', (type, query, duration) => {
	log.debug(query, `${type} query completed in ${duration}ms`);
});
mysql.on('query-error', (err, type, query, duration) => {
	log.error({ err, query }, `${type} query failed after ${duration}ms`);
});

module.exports = mysql;
```

```js
// user.js
var mysql = require('./mysql');

exports.getById = (userid) => mysql.queryRow('SELECT * FROM users WHERE id = :userid', { userid });
```

```js
// user.spec.js
var assert = require('assert');
var sinon = require('sinon');
var proxyquire = require('proxyquire').noCallThru();
var StubMysql = {}
var User = proxyquire('./user', {
	'./mysql': StubMysql
});

define('getById', () => {
	beforeEach(() => {
		StubMysql.queryRow = sinon.stub()
	})

	it('should return a user record', () => {
		var userRecord = { id: 5 };
		StubMysql.queryRow.withArgs(5).returns(Promise.resolve(userRecord));

		return User.getById(5).then((result) => {
			assert.equal(result, userRecord);
		});
	});
});
```