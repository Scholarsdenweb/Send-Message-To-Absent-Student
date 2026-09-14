const bcrypt = require('bcryptjs');

const hashPassword = (plain) => bcrypt.hash(plain, 10);
const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

// Strip sensitive fields before sending a user to the client.
function toSafeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    lastLogin: u.lastLogin,
  };
}

module.exports = { hashPassword, verifyPassword, toSafeUser };
