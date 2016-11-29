
var mktmpio = require('mktmpio');
var mysql   = require('mysql2/promise');
var schema  = require('../lib/testdb.js');
var Promise = require('bluebird');

var current;

exports.create = function () {
	if (current) return Promise.resolve(current);

	return new Promise((resolve, reject) => {
		mktmpio.create('mysql', (err, result) => {
			if (err) return reject(err);
			if (result && result.error) {
				return reject(new Error('mktmp.io: ' + result.error));
			}
			if (!result || !result.host) {
				return reject(new Error('mktmp.io did not respond with a usable database entry.'));
			}
			current = result;
			return resolve(result);
		});
	});
};

exports.populate = function () {
	return mysql.createConnection({
		host: current.host,
		port: current.port,
		user: current.username,
		password: current.password,
	}).then((connection) =>
		Promise.each(schema, (sql) => connection.query(sql))
			.then(() => connection.end())
	);
};

exports.destroy = function () {
	if (!current) return Promise.resolve();
	return new Promise((resolve, reject) => {
		mktmpio.destroy(current.id, (err, result) => {
			if (err || result.error) return reject(err);
			current = null;
			return resolve(result);
		});
	});
};
