// Validate password: at least 8 characters, contains both letters and numbers
function isValidPassword(password) {
    if (password.length < 8) return false;
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    return hasLetter && hasNumber;
  }
  
  // Convert dd/MM/yyyy to Date object
  function parseDateString(dateStr) {
    const [day, month, year] = dateStr.split('/');
    // Create ISO formatted date string (yyyy-MM-dd)
    const isoDateStr = `${year}-${month}-${day}`;
    const dateObj = new Date(isoDateStr);
    return isNaN(dateObj) ? null : dateObj;
  }
  
  // Generate a 6-digit confirmation code
  function generateConfirmationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
  
  module.exports = {
    isValidPassword,
    parseDateString,
    generateConfirmationCode,
  };
  