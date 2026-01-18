class Logger {
  static LEVELS = {
    DEBUG: 10,
    INFO: 20,
    WARN: 30,
    ERROR: 40,
    NONE: 100,
  };

  constructor(name, level = Logger.LEVELS.INFO) {
    this.name = name;
    this.level = level;
  }

  setLevel(level) {
    this.level = level;
  }

  _log(levelName, levelValue, message, ...args) {
    if (levelValue < this.level) return;

    const time = new Date().toISOString();
    const prefix = `[${time}] [${levelName}] [${this.name}]`;

    switch (levelName) {
      case "DEBUG":
        console.debug(prefix, message, ...args);
        break;
      case "INFO":
        console.info(prefix, message, ...args);
        break;
      case "WARN":
        console.warn(prefix, message, ...args);
        break;
      case "ERROR":
        console.error(prefix, message, ...args);
        break;
      default:
        console.log(prefix, message, ...args);
    }
  }

  debug(message, ...args) {
    this._log("DEBUG", Logger.LEVELS.DEBUG, message, ...args);
  }

  info(message, ...args) {
    this._log("INFO", Logger.LEVELS.INFO, message, ...args);
  }

  warn(message, ...args) {
    this._log("WARN", Logger.LEVELS.WARN, message, ...args);
  }

  error(message, ...args) {
    this._log("ERROR", Logger.LEVELS.ERROR, message, ...args);
  }
}

window.Logger = Logger;
