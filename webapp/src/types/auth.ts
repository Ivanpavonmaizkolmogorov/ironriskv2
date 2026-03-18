/** Auth types matching the Python backend schemas. */

export interface User {
  id: string;
  email: string;
}

export interface APIToken {
  id: string;
  token: string;
  label: string;
  is_active: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}
