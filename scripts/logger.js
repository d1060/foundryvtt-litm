/**
 * @typedef {Object} Status - Status color
 * @property {string} SUCCESS - Success color
 * @property {string} INFO - Info color
 * @property {string} ERROR - Error color
 */
export const Status = {
	SUCCESS: "#2c3177ff",
	INFO: "hsl(225.94 10.66% 41.72%)",
	WARN: "hsla(45, 91%, 26%, 1.00)",
	ERROR: "hsla(6, 100%, 33%, 1.00)",
};

/**
 * @param {Status} status
 * @returns {function}
 */
export function log(status) {
	/**
	 * @param  {...string} args
	 * @returns {void}
	 */
	return (...args) => {
		return console.log(
			`%cLegend in the Mist | %c${args.join("\n")}`,
			`font-weight: bold; color: ${status};`,
			"color: hsla(0, 0%, 33%, 1.00);",
		);
	};
}

/**
 * @param  {...string} args
 * @returns {void}
 * @example
 * error("This is an error message");
 */
export function error(...args) {
	return log(Status.ERROR)(...args);
}

/**
 * @param  {...string} args
 * @returns {void}
 * @example
 * success("This is an error message");
 */
export function success(...args) {
	return log(Status.SUCCESS)(...args);
}

/**
 * @param  {...string} args
 * @returns {void}
 * @example
 * info("This is an info message");
 */
export function info(...args) {
	return log(Status.INFO)(...args);
}

/**
 * @param  {...string} args
 * @returns {void}
 * @example
 * warn("This is a warning message");
 */
export function warn(...args) {
	return log(Status.WARN)(...args);
}
