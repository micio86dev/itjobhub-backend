# Environment Variables

## Local Development (.env.local)
```
# Server Configuration
PORT=3001
HOST=localhost
NODE_ENV=development

# Database
DATABASE_URL=mongodb+srv://username:password@cluster.mongodb.net/itjobhub_dev

# JWT
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=24h
REFRESH_TOKEN_SECRET=your-super-secret-refresh-token-key-here
REFRESH_TOKEN_EXPIRES_IN=7d

# Mailgun
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_DOMAIN=your-domain.mailgun.org
MAILGUN_FROM_EMAIL=noreply@your-domain.mailgun.org

# CORS
CLIENT_URL=http://localhost:3000

# Feature Flags
FEATURE_USER_REGISTRATION=true
FEATURE_JOB_POSTING=true
```

## Staging Environment (.env.staging)
```
# Server Configuration
PORT=3001
HOST=0.0.0.0
NODE_ENV=production

# Database
DATABASE_URL=mongodb+srv://username:password@cluster.mongodb.net/itjobhub_staging

# JWT
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=24h
REFRESH_TOKEN_SECRET=your-super-secret-refresh-token-key-here
REFRESH_TOKEN_EXPIRES_IN=7d

# Mailgun
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_DOMAIN=your-domain.mailgun.org
MAILGUN_FROM_EMAIL=noreply@your-domain.mailgun.org

# CORS
CLIENT_URL=https://staging.itjobhub.com

# Feature Flags
FEATURE_USER_REGISTRATION=true
FEATURE_JOB_POSTING=true
```

## Production Environment (.env.production)
```
# Server Configuration
PORT=3001
HOST=0.0.0.0
NODE_ENV=production

# Database
DATABASE_URL=mongodb+srv://username:password@cluster.mongodb.net/itjobhub_prod

# JWT
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=24h
REFRESH_TOKEN_SECRET=your-super-secret-refresh-token-key-here
REFRESH_TOKEN_EXPIRES_IN=7d

# Mailgun
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_DOMAIN=your-domain.mailgun.org
MAILGUN_FROM_EMAIL=noreply@your-domain.mailgun.org

# CORS
CLIENT_URL=https://itjobhub.com

# Feature Flags
FEATURE_USER_REGISTRATION=true
FEATURE_JOB_POSTING=true
```