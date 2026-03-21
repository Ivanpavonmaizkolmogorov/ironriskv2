/** Trading Account types matching the Python backend schemas. */

export interface TradingAccount {
  id: string;
  name: string;
  broker?: string | null;
  account_number?: string | null;
  api_token: string;
  is_active: boolean;
  created_at: string;
}

export interface CreateTradingAccountPayload {
  name: string;
  broker?: string | null;
  account_number?: string | null;
}
