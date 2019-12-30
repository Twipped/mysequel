
var isObject = exports.isObject = function isObject (input) {
	if (!input) return false;
	if (typeof input !== 'object') return false;
	if (Array.isArray(input)) return false;
	if (!(input instanceof Object)) return false;
	if (input.constructor !== Object.prototype.constructor) return false;
	return true;
};

const merge = exports.merge =  function merge (...sources) { // eslint-disable-line no-unused-vars
	const result = {};
	for (const source of sources) {
		if (!source) continue;
		for (const [ key, value ] of Object.entries(source)) {
			if (isObject(value)) {
				if (isObject(result[key])) {
					result[key] = merge(result[key], value);
				} else {
					result[key] = merge(value);
				}
			} else {
				result[key] = value;
			}
		}
	}
	return result;
};
