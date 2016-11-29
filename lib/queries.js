
var promiseQuery = require('./promise-query');

function first (results) {
	return Array.isArray(results) && results.length && results[0] || null;
}

// promiseQuery returns an array of [results, fields]. use first to ignore fields
exports.query = (q) => promiseQuery(q).then(first);

exports.queryRow = (q) => exports.query(q).then(first);

exports.queryColumn = (q) => promiseQuery(q).spread((results, fields) => {
	if (!results || !results.length || !fields.length) return [];
	var key = fields[0].name;

	return results.map((row) => row[key]);
});

exports.queryCell = (q) => promiseQuery(q).spread((results, fields) => {
	if (!results || !results.length || !fields.length) return null;
	var key = fields[0].name;

	return results[0][key];
});

exports.queryInsert = (q) => promiseQuery(q).spread((results) => results.insertId);

exports.queryAffected = (q) => promiseQuery(q).spread((results) => results.affectedRows);

exports.queryChanged = (q) => promiseQuery(q).spread((results) => results.changedRows);
