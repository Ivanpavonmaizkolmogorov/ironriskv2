/** Auth types matching the Python backend schemas. */

export interface User {
  id: string;
  email: string;
  is_admin?: boolean;
  email_verified?: boolean;
}

// APIToken removed (now TradingAccount)

export interface TokenResponse {
  access_token: string;
  token_type: string;
}
