const bcrypt = require('bcryptjs');
bcrypt.hash('Tenant@123456', 12).then(h => console.log('HASH:', h));
