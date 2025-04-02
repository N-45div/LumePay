/**
 * Direct Logger Utility
 * 
 * A simplified logging utility that directly writes to log files
 * in the project root directory to ensure they are accessible.
 */
const fs = require('fs');
const path = require('path');
const util = require('util');

class DirectLogger {
  constructor(testName) {
    this.testName = testName || 'Unnamed Test';
    this.startTime = new Date();
    this.logFilePath = path.join(process.cwd(), `${testName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.log`);
    
    // Initialize log file with header
    fs.writeFileSync(
      this.logFilePath,
      `TEST RESULTS: ${this.testName}\n` +
      `Started at: ${this.startTime.toISOString()}\n` +
      `===========================================\n\n`
    );
    
    console.log(`Logging to file: ${this.logFilePath}`);
  }
  
  /**
   * Log a message to both console and file
   */
  log(message, ...args) {
    const formattedMessage = args.length > 0 ? util.format(message, ...args) : message;
    
    // Write to file
    fs.appendFileSync(
      this.logFilePath,
      `[${new Date().toISOString()}] ${formattedMessage}\n`
    );
    
    // Also log to console
    console.log(formattedMessage);
  }
  
  /**
   * Log an error message
   */
  error(message, ...args) {
    const formattedMessage = args.length > 0 ? util.format(message, ...args) : message;
    
    // Write to file
    fs.appendFileSync(
      this.logFilePath,
      `[${new Date().toISOString()}] ERROR: ${formattedMessage}\n`
    );
    
    // Also log to console
    console.error(formattedMessage);
  }
  
  /**
   * End the test and write summary
   */
  end(results = {}) {
    const endTime = new Date();
    const duration = (endTime - this.startTime) / 1000;
    
    let summaryText = `\n===========================================\n`;
    summaryText += `Test completed at: ${endTime.toISOString()}\n`;
    summaryText += `Duration: ${duration.toFixed(2)} seconds\n\n`;
    
    if (Object.keys(results).length > 0) {
      summaryText += `RESULTS SUMMARY:\n`;
      for (const [key, value] of Object.entries(results)) {
        summaryText += `${key}: ${value}\n`;
      }
    }
    
    // Write summary to file
    fs.appendFileSync(this.logFilePath, summaryText);
    
    // Log to console where the results are saved
    console.log(`\nTest results saved to: ${this.logFilePath}`);
    
    return {
      logFilePath: this.logFilePath,
      duration
    };
  }
}

module.exports = DirectLogger;
