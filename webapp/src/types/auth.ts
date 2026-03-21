/** Auth types matching the Python backend schemas. */

export interface User {
  id: string;
  email: string;
}

// APIToken removed (now TradingAccount)

export interface TokenResponse {
  access_token: string;
  token_type: string;
}
