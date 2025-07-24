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

  const creditActions = {
  // Increase credit by 10 when creating a campaign
  campaign_creation: 10,
  // Increase credit by 5 when donating
  donation: 5,
  // Decrease credit by 10 when a user's campaign is reported and taken down
  campaign_report: -10,
  // Add additional keywords and their corresponding credit changes as the development progresses deeper
};
  
  module.exports = {
    isValidPassword,
    parseDateString,
    generateConfirmationCode,
    creditActions,
  };
  