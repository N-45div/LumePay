/**
 * Test Logger Utility
 * 
 * This utility logs test results to both console and a file
 * for easy review and debugging.
 */
const fs = require('fs');
const path = require('path');
const util = require('util');

class TestLogger {
  constructor(options = {}) {
    this.options = {
      logToFile: true,
      logToConsole: true,
      logDirectory: path.join(process.cwd(), 'logs'),
      fileName: `test-results-${new Date().toISOString().replace(/:/g, '-')}.log`,
      ...options
    };
    
    this.testName = options.testName || 'Unnamed Test';
    this.startTime = null;
    this.endTime = null;
    
    // Create logs directory if it doesn't exist
    if (this.options.logToFile && !fs.existsSync(this.options.logDirectory)) {
      fs.mkdirSync(this.options.logDirectory, { recursive: true });
    }
    
    this.logFilePath = path.join(this.options.logDirectory, this.options.fileName);
    
    // Initialize log file with header
    if (this.options.logToFile) {
      fs.writeFileSync(
        this.logFilePath, 
        `TEST RESULTS: ${this.testName}\n` +
        `Started at: ${new Date().toISOString()}\n` +
        `===========================================\n\n`
      );
    }
    
    // Capture console output
    this._hookConsole();
  }
  
  /**
   * Capture console output and redirect to file
   */
  _hookConsole() {
    // Store original console methods
    this.originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error
    };
    
    // Override console methods to also write to file
    const self = this;
    
    console.log = function() {
      self._writeToFile('LOG', arguments);
      if (self.options.logToConsole) {
        self.originalConsole.log.apply(console, arguments);
      }
    };
    
    console.info = function() {
      self._writeToFile('INFO', arguments);
      if (self.options.logToConsole) {
        self.originalConsole.info.apply(console, arguments);
      }
    };
    
    console.warn = function() {
      self._writeToFile('WARN', arguments);
      if (self.options.logToConsole) {
        self.originalConsole.warn.apply(console, arguments);
      }
    };
    
    console.error = function() {
      self._writeToFile('ERROR', arguments);
      if (self.options.logToConsole) {
        self.originalConsole.error.apply(console, arguments);
      }
    };
  }
  
  /**
   * Write log entry to file
   */
  _writeToFile(level, args) {
    if (!this.options.logToFile) return;
    
    const timestamp = new Date().toISOString();
    const message = util.format.apply(null, args);
    
    fs.appendFileSync(
      this.logFilePath, 
      `[${timestamp}] [${level}] ${message}\n`
    );
  }
  
  /**
   * Start timing test execution
   */
  startTest() {
    this.startTime = Date.now();
    this.log(`Starting test: ${this.testName}`);
  }
  
  /**
   * End test timing and output summary
   */
  endTest(summary = {}) {
    this.endTime = Date.now();
    const duration = (this.endTime - this.startTime) / 1000;
    
    this.log(`\nTest completed: ${this.testName}`);
    this.log(`Duration: ${duration.toFixed(2)} seconds`);
    
    if (Object.keys(summary).length > 0) {
      this.log('\nSUMMARY:');
      for (const [key, value] of Object.entries(summary)) {
        this.log(`${key}: ${value}`);
      }
    }
    
    // Add final separator
    this.log('\n===========================================');
  }
  
  /**
   * Log a message with timestamp
   */
  log(message) {
    console.log(message);
  }
  
  /**
   * Log an info message
   */
  info(message) {
    console.info(message);
  }
  
  /**
   * Log a warning
   */
  warn(message) {
    console.warn(message);
  }
  
  /**
   * Log an error
   */
  error(message) {
    console.error(message);
  }
  
  /**
   * Restore original console methods
   */
  restore() {
    console.log = this.originalConsole.log;
    console.info = this.originalConsole.info;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
  }
}

module.exports = TestLogger;
