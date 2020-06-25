const winston = require("winston");
const DatadogTransport = require("./datadogTransport");
const Formatter = require("./loggerFormat");

const logger = winston.createLogger({
  transports: [
    new winston.transports.Console({
      level: process.env.NODE_ENV === "production" ? "verbose" : "debug",
      handleExceptions: true,
      format: winston.format.combine(
        // winston.format.colorize(),
        new Formatter({ includeID: false }),
        winston.format.printf(
          ({ date, level, stack, description, ...rest }) => {
            const errStack = stack ? `\n${stack}` : "";
            const meta =
              rest && Object.keys(rest).length
                ? `\n${JSON.stringify(rest)}`
                : "";
            return `[${date}] ${level}: ${description} ${meta} ${errStack}`;
          }
        )
      )
    }),
    new DatadogTransport({
      level: "info",
      handleExceptions: true,
      format: new Formatter({ includeID: true })
    })
  ],
  exitOnError: false
});

module.exports = logger;
module.exports.stream = {
  write: message => {
    logger.verbose(message.replace(/\n$/, ""));
  }
};
