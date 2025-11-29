import jwt from 'jsonwebtoken';

// Your Apple Developer values
const TEAM_ID = '4G65K64G73'; // Found in Apple Developer portal (top right)
const KEY_ID = 'com.tryeatpal.yourapp'; // From when you created the key
const CLIENT_ID = 'com.tryeatpal.signin'; // Your Service ID
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg3jfGEQdXRwE/APzt
0QqHr5FEbslDK1cRRwLVYz1IxQ+gCgYIKoZIzj0DAQehRANCAATUCjFPB8vExEEh
joiC5VuJUukHisptoaVc1BEYAffcgwjk8HbJGPG2SdQcuziUoJj8vHokst43a0jC
5stvag7r
-----END PRIVATE KEY-----`;

const token = jwt.sign(
  {
    iss: TEAM_ID,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 15777000, // 6 months (max allowed)
    aud: 'https://appleid.apple.com',
    sub: CLIENT_ID,
  },
  PRIVATE_KEY,
  {
    algorithm: 'ES256',
    header: {
      alg: 'ES256',
      kid: KEY_ID,
    },
  }
);

console.log('Your Client Secret (JWT):');
console.log(token);
