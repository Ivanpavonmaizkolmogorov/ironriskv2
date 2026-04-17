//+------------------------------------------------------------------+
//|                                        IronRisk_Service.mq5      |
//|                               Copyright 2026, IronRisk System    |
//|                                          https://ironrisk.pro    |
//+------------------------------------------------------------------+
#property service
#property copyright "IronRisk System"
#property link      "https://ironrisk.pro"
#property version   "1.00"
#property description "IronRisk Background Connector — Heartbeat & Trade Sync"
#property description "Runs without a chart. Auto-starts with MT5."

// --- External Dependencies (Wininet) ---
#import "wininet.dll"
int InternetOpenW(string sAgent, int lAccessType, string sProxyName, string sProxyBypass, int lFlags);
int InternetConnectW(int hInternet, string sServerName, int nServerPort, string sUsername, string sPassword, int lService, int lFlags, int lContext);
int HttpOpenRequestW(int hConnect, string sVerb, string sObjectName, string sVersion, string sReferer, string sAcceptTypes, int lFlags, int lContext);
bool HttpSendRequestW(int hRequest, string sHeaders, int lHeadersLength, char &lpOptional[], int nOptionalLength);
int InternetReadFile(int hFile, char &sBuffer[], int lNumBytesToRead, int &lNumberOfBytesRead);
int InternetCloseHandle(int hInternet);
#import

#define INTERNET_OPEN_TYPE_PRECONFIG (uint)0
#define INTERNET_SERVICE_HTTP (uint)3
#define INTERNET_FLAG_RELOAD (uint)0x80000000
#define INTERNET_FLAG_SECURE (uint)0x00800000

// --- User Inputs ---
string         InpApiToken    = "PASTE_TOKEN_HERE"; // Trading Account API Token
string         InpWebhookHost = "api.ironrisk.pro"; // Backend Server (no http://)
int            InpWebhookPort = 443;                // Port (8001 dev, 443 prod)
bool           InpUseHTTPS    = true;               // Use HTTPS
int            InpTimerSec    = 5;                   // Heartbeat Frequency (seconds)

const string   API_BASE_PATH  = "/api/live/";        // API Base Path (internal)
string         GlobalHostname = "Unknown";             // Captured from config.txt


//+------------------------------------------------------------------+
//| CConfigManager: Token & Settings from file                       |
//+------------------------------------------------------------------+
class CConfigManager
  {
private:
   string m_configDir;
   string m_configFile;
   
public:
   CConfigManager()
     {
      m_configDir  = "IronRisk";
      m_configFile = "IronRisk\\config.txt";
     }
   
   // Resolve token: input param takes priority, then config file
   string ResolveToken(string inputToken)
     {
      string finalToken = inputToken;
      if(inputToken == "PASTE_TOKEN_HERE")
         finalToken = "";
      
      // Try reading from config file written by installer
      if(FileIsExist(m_configFile))
        {
         int h = FileOpen(m_configFile, FILE_READ|FILE_TXT|FILE_ANSI);
         if(h != INVALID_HANDLE)
           {
            while(!FileIsEnding(h))
              {
               string line = FileReadString(h);
               StringTrimLeft(line); StringTrimRight(line);
               
               if(StringFind(line, "token=") == 0) 
                 {
                  string t = StringSubstr(line, 6);
                  if(t != "" && t != "PASTE_TOKEN_HERE") finalToken = t; // ALways override cached input with installer's config token
                 }
               else if(StringFind(line, "host=") == 0) InpWebhookHost = StringSubstr(line, 5);
               else if(StringFind(line, "port=") == 0) InpWebhookPort = (int)StringToInteger(StringSubstr(line, 5));
               else if(StringFind(line, "https=") == 0) InpUseHTTPS = (StringSubstr(line, 6) == "true" || StringSubstr(line, 6) == "1");
               else if(StringFind(line, "https=") == 0) InpUseHTTPS = (StringSubstr(line, 6) == "true" || StringSubstr(line, 6) == "1");
               else if(StringFind(line, "hostname=") == 0) GlobalHostname = StringSubstr(line, 9);
               
               // Also support plain token on first line if it starts with irk_
               else if(StringFind(line, "irk_") == 0)
                 {
                  if(line != "") finalToken = line;
                 }
              }
            FileClose(h);
            Print("[IR-Service] Config loaded from file. Host: ", InpWebhookHost);
           }
         else
           {
            Print("[IR-Service] Cannot open config file at ", m_configFile);
           }
        }
      else
        {
         Print("[IR-Service] No config file found at ", m_configFile);
        }
      
      // Fallback behavior
      if(finalToken == "")
         return inputToken; // Returns "PASTE_TOKEN_HERE" which will trigger an error down the line
         
      return finalToken;
     }
  };


//+------------------------------------------------------------------+
//| CHttpClient: Low-level HTTP via WinInet                          |
//+------------------------------------------------------------------+
class CHttpClient
  {
private:
   string m_host;
   int    m_port;
   bool   m_https;
   
public:
   CHttpClient(string host, int port, bool https)
      : m_host(host), m_port(port), m_https(https) {}
   
   // GET request, returns response body
   string Get(string endpoint)
     {
      int hI = InternetOpenW("IronRisk_Svc", INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
      if(!hI) return "";
      int hC = InternetConnectW(hI, m_host, m_port, "", "", INTERNET_SERVICE_HTTP, 0, 0);
      if(!hC) { InternetCloseHandle(hI); return ""; }
      uint fl = INTERNET_FLAG_RELOAD;
      if(m_https) fl |= INTERNET_FLAG_SECURE;
      int hR = HttpOpenRequestW(hC, "GET", endpoint, "HTTP/1.1", NULL, NULL, (int)fl, 0);
      if(!hR) { InternetCloseHandle(hC); InternetCloseHandle(hI); return ""; }
      
      char opt[];
      bool res = HttpSendRequestW(hR, "", 0, opt, 0);
      string resp = "";
      if(res)
        {
         char buf[2048]; int rd = 0;
         while(InternetReadFile(hR, buf, 2048, rd) && rd > 0)
            resp += CharArrayToString(buf, 0, rd, CP_UTF8);
        }
      InternetCloseHandle(hR);
      InternetCloseHandle(hC);
      InternetCloseHandle(hI);
      return resp;
     }
   
   // POST request with JSON body, returns response body
   string Post(string endpoint, string jsonBody)
     {
      char post[];
      StringToCharArray(jsonBody, post, 0, WHOLE_ARRAY, CP_UTF8);
      int sz = ArraySize(post) - 1; // Exclude null terminator
      string hdr = "Content-Type: application/json\r\n";
      
      int hI = InternetOpenW("IronRisk_Svc", INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
      if(!hI) return "";
      int hC = InternetConnectW(hI, m_host, m_port, "", "", INTERNET_SERVICE_HTTP, 0, 0);
      if(!hC) { InternetCloseHandle(hI); return ""; }
      uint fl = INTERNET_FLAG_RELOAD;
      if(m_https) fl |= INTERNET_FLAG_SECURE;
      int hR = HttpOpenRequestW(hC, "POST", endpoint, "HTTP/1.1", NULL, NULL, (int)fl, 0);
      if(!hR) { InternetCloseHandle(hC); InternetCloseHandle(hI); return ""; }
      
      bool res = HttpSendRequestW(hR, hdr, StringLen(hdr), post, sz);
      string resp = "";
      if(res)
        {
         char buf[2048]; int rd = 0;
         while(InternetReadFile(hR, buf, 2048, rd) && rd > 0)
            resp += CharArrayToString(buf, 0, rd, CP_UTF8);
        }
      InternetCloseHandle(hR);
      InternetCloseHandle(hC);
      InternetCloseHandle(hI);
      return resp;
     }
  };


//+------------------------------------------------------------------+
//| CAccountMonitor: Reads MT5 positions & history                   |
//+------------------------------------------------------------------+
struct SFloatingEntry
  {
   long   magic;
   double value;
  };

class CAccountMonitor
  {
private:
   SFloatingEntry m_floating[];
   int            m_floatCount;
   double         m_totalFloatingPnL;
   int            m_openTrades;
   double         m_cumulativeClosedPnL;
   double         m_peakPnL;
   double         m_drawdown;
   double         m_equity;
   
public:
   CAccountMonitor()
     {
      m_floatCount = 0;
      m_totalFloatingPnL = 0.0;
      m_openTrades = 0;
      m_cumulativeClosedPnL = 0.0;
      m_peakPnL = 0.0;
      m_drawdown = 0.0;
      m_equity = 0.0;
     }
   
   // Getters
   int            OpenTrades()       const { return m_openTrades; }
   double         FloatingPnL()      const { return m_totalFloatingPnL; }
   double         ClosedPnL()        const { return m_cumulativeClosedPnL; }
   double         Equity()           const { return m_equity; }
   double         Drawdown()         const { return m_drawdown; }
   double         Peak()             const { return m_peakPnL; }
   int            FloatCount()       const { return m_floatCount; }
   long           FloatMagic(int i)  const { return (i >= 0 && i < m_floatCount) ? m_floating[i].magic : 0; }
   double         FloatValue(int i)  const { return (i >= 0 && i < m_floatCount) ? m_floating[i].value : 0.0; }
   
   // Snapshot all open positions and closed deal history
   void Refresh()
     {
      CalculateFloating();
      CalculateClosed();
      
      m_equity = m_cumulativeClosedPnL + m_totalFloatingPnL;
      if(m_equity > m_peakPnL) m_peakPnL = m_equity;
      m_drawdown = (m_peakPnL > m_equity) ? (m_peakPnL - m_equity) : 0.0;
     }
   
   // Build JSON map of floating PnL per magic: {"12345": 100.50, "67890": -30.20}
   string FloatingMapJSON()
     {
      string result = "";
      for(int i = 0; i < m_floatCount; i++)
        {
         if(i > 0) result += ",";
         result += "\"" + IntegerToString(m_floating[i].magic) + "\":" 
                   + DoubleToString(m_floating[i].value, 2);
        }
      return result;
     }

private:
   void CalculateFloating()
     {
      m_floatCount = 0;
      m_totalFloatingPnL = 0.0;
      m_openTrades = 0;
      ArrayResize(m_floating, 100);
      
      for(int p = PositionsTotal() - 1; p >= 0; p--)
        {
         ulong tk = PositionGetTicket(p);
         if(!PositionSelectByTicket(tk)) continue;
         
         long mag = PositionGetInteger(POSITION_MAGIC);
         double posFloat = PositionGetDouble(POSITION_PROFIT)
                         + PositionGetDouble(POSITION_SWAP);
         
         m_openTrades++;
         m_totalFloatingPnL += posFloat;
         
         // Aggregate per magic
         bool found = false;
         for(int f = 0; f < m_floatCount; f++)
           {
            if(m_floating[f].magic == mag)
              {
               m_floating[f].value += posFloat;
               found = true;
               break;
              }
           }
         if(!found && m_floatCount < 100)
           {
            m_floating[m_floatCount].magic = mag;
            m_floating[m_floatCount].value = posFloat;
            m_floatCount++;
           }
        }
     }
   
   void CalculateClosed()
     {
      double newClosed = 0.0;
      if(!HistorySelect(0, TimeCurrent())) return;
      
      int total = HistoryDealsTotal();
      for(int d = 0; d < total; d++)
        {
         ulong tk = HistoryDealGetTicket(d);
         if(tk <= 0) continue;
         long entry = HistoryDealGetInteger(tk, DEAL_ENTRY);
         if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT) continue;
         
         newClosed += HistoryDealGetDouble(tk, DEAL_PROFIT)
                    + HistoryDealGetDouble(tk, DEAL_SWAP)
                    + HistoryDealGetDouble(tk, DEAL_COMMISSION);
        }
      m_cumulativeClosedPnL = newClosed;
     }
  };


//+------------------------------------------------------------------+
//| CTradeSyncer: Incremental deal sync to backend                   |
//+------------------------------------------------------------------+
class CTradeSyncer
  {
private:
   CHttpClient *m_http;
   string       m_basePath;
   string       m_token;
   
public:
   CTradeSyncer(CHttpClient *http, string basePath, string token)
      : m_http(http), m_basePath(basePath), m_token(token) {}
   
   bool SyncClosedDeals(long magic)
     {
      // GlobalVariable-based incremental tracking (compatible with EA v64+)
      string gvName = "IR_Sync_v64_b_" + m_token + "_" + IntegerToString(magic);
      datetime lastSync = 0;
      if(GlobalVariableCheck(gvName))
         lastSync = (datetime)GlobalVariableGet(gvName);
      
      if(!HistorySelect(lastSync, TimeCurrent() + 86400)) return false;
      int total = HistoryDealsTotal();
      if(total == 0) return true;
      
      // Stage 1: Snapshot relevant tickets
      ulong sync_tickets[];
      int tCount = 0;
      for(int d = 0; d < total; d++)
        {
         ulong tk = HistoryDealGetTicket(d);
         if(tk > 0)
           {
            long entry = HistoryDealGetInteger(tk, DEAL_ENTRY);
            if(entry == DEAL_ENTRY_OUT || entry == DEAL_ENTRY_INOUT)
              {
               long mag = HistoryDealGetInteger(tk, DEAL_MAGIC);
               if(mag == magic || magic == 0)
                 {
                  ArrayResize(sync_tickets, tCount + 1, 100);
                  sync_tickets[tCount++] = tk;
                 }
              }
           }
        }
      
      if(tCount == 0) return true;
      
      // Stage 2: Build JSON
      string jsonTrades = "";
      int count = 0;
      datetime maxTime = lastSync;
      
      for(int i = 0; i < tCount; i++)
        {
         ulong tk = sync_tickets[i];
         HistoryDealSelect(tk);
         
         long mag = HistoryDealGetInteger(tk, DEAL_MAGIC);
         datetime dealTime = (datetime)HistoryDealGetInteger(tk, DEAL_TIME);
         if(dealTime < lastSync) continue;
         
         double d_profit = HistoryDealGetDouble(tk, DEAL_PROFIT);
         double d_swap   = HistoryDealGetDouble(tk, DEAL_SWAP);
         double d_comm   = HistoryDealGetDouble(tk, DEAL_COMMISSION);
         
         string sym   = HistoryDealGetString(tk, DEAL_SYMBOL);
         double vol   = HistoryDealGetDouble(tk, DEAL_VOLUME);
         string cmt   = HistoryDealGetString(tk, DEAL_COMMENT);
         StringReplace(cmt, "\\", ""); StringReplace(cmt, "\"", "'");
         
         double close_pr = HistoryDealGetDouble(tk, DEAL_PRICE);
         long deals_type = HistoryDealGetInteger(tk, DEAL_TYPE);
         string dType = "OUT";
         if(deals_type == DEAL_TYPE_BUY)  dType = "SELL";
         else if(deals_type == DEAL_TYPE_SELL) dType = "BUY";
         
         long posId = HistoryDealGetInteger(tk, DEAL_POSITION_ID);
         double open_pr = 0, sl = 0, tp = 0;
         long open_time_val = 0;
         
         // Position historical lookup
         if(posId > 0 && HistorySelectByPosition(posId))
           {
            int pdTotal = HistoryDealsTotal();
            double pos_comm = 0, pos_swap = 0;
            for(int pd = 0; pd < pdTotal; pd++)
              {
               ulong pdtk = HistoryDealGetTicket(pd);
               pos_comm += HistoryDealGetDouble(pdtk, DEAL_COMMISSION);
               pos_swap += HistoryDealGetDouble(pdtk, DEAL_SWAP);
               long en = HistoryDealGetInteger(pdtk, DEAL_ENTRY);
               if(en == DEAL_ENTRY_IN || en == DEAL_ENTRY_INOUT)
                 {
                  if(open_pr == 0)
                    {
                     open_pr = HistoryDealGetDouble(pdtk, DEAL_PRICE);
                     open_time_val = HistoryDealGetInteger(pdtk, DEAL_TIME);
                    }
                 }
              }
            d_comm = pos_comm;
            d_swap = pos_swap;
            
            int poTotal = HistoryOrdersTotal();
            for(int po = 0; po < poTotal; po++)
              {
               ulong potk = HistoryOrderGetTicket(po);
               double ord_sl = HistoryOrderGetDouble(potk, ORDER_SL);
               double ord_tp = HistoryOrderGetDouble(potk, ORDER_TP);
               if(ord_sl > 0) sl = ord_sl;
               if(ord_tp > 0) tp = ord_tp;
              }
           }
         
         double profit = d_profit + d_swap + d_comm;
         
         string tObj = "{\"ticket\":" + IntegerToString(tk) +
                       ",\"magic_number\":" + IntegerToString(mag) +
                       ",\"symbol\":\"" + sym + "\"" +
                       ",\"volume\":" + DoubleToString(vol, 2) +
                       ",\"profit\":" + DoubleToString(profit, 2) +
                       ",\"comment\":\"" + cmt + "\"" +
                       ",\"close_time\":" + IntegerToString((int)dealTime) +
                       ",\"open_time\":" + (open_time_val > 0 ? IntegerToString((int)open_time_val) : "null") +
                       ",\"open_price\":" + (open_pr > 0 ? DoubleToString(open_pr, 5) : "null") +
                       ",\"close_price\":" + DoubleToString(close_pr, 5) +
                       ",\"sl\":" + (sl > 0 ? DoubleToString(sl, 5) : "null") +
                       ",\"tp\":" + (tp > 0 ? DoubleToString(tp, 5) : "null") +
                       ",\"deal_type\":\"" + dType + "\"" +
                       ",\"commission\":" + DoubleToString(d_comm, 2) +
                       ",\"swap\":" + DoubleToString(d_swap, 2) + "}";
         
         if(count > 0) jsonTrades += ",";
         jsonTrades += tObj;
         count++;
         if(dealTime > maxTime) maxTime = dealTime;
         if(count >= 500) break;
        }
      
      if(count == 0)
        {
         GlobalVariableSet(gvName, (double)(TimeCurrent()));
         return true;
        }
      
      string payload = "{\"api_token\":\"" + m_token + "\""
                     + ",\"account_number\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "\""
                     + ",\"hostname\":\"" + GlobalHostname + "\""
                     + ",\"trades\":[" + jsonTrades + "]}";
      
      string resp = m_http.Post(m_basePath + "sync-trades", payload);
      if(resp != "")
         GlobalVariableSet(gvName, (double)(maxTime + 1));
      
      return (resp != "");
     }
  };


//+------------------------------------------------------------------+
//| CHeartbeatSender: Sends heartbeat & processes server response    |
//+------------------------------------------------------------------+
class CHeartbeatSender
  {
private:
   CHttpClient *m_http;
   string       m_basePath;
   string       m_token;
   bool         m_killed;
   
public:
   CHeartbeatSender(CHttpClient *http, string basePath, string token)
      : m_http(http), m_basePath(basePath), m_token(token), m_killed(false) {}
   
   bool IsKilled() const { return m_killed; }
   
   bool Send(long magic, double pnl, double dd, int trades, string floatingMapJSON)
     {
      string json = "{\"api_token\":\"" + m_token + "\""
                  + ",\"account_number\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "\""
                  + ",\"hostname\":\"" + GlobalHostname + "\""
                  + ",\"magic_number\":" + IntegerToString(magic)
                  + ",\"current_pnl\":" + DoubleToString(pnl, 2)
                  + ",\"current_drawdown\":" + DoubleToString(dd, 2)
                  + ",\"open_trades\":" + IntegerToString(trades)
                  + ",\"consecutive_losses\":0"
                  + ",\"stagnation_days\":0"
                  + ",\"stagnation_trades\":0"
                  + ",\"floating_by_magic\":{" + floatingMapJSON + "}}";
      
      string resp = m_http.Post(m_basePath + "heartbeat", json);
      if(resp == "") return false;
      
      // Kill signal detection
      if(StringFind(resp, "\"kill\":true") >= 0 || StringFind(resp, "\"status\":\"KILL\"") >= 0)
        {
         string reason = "Account mismatch detected.";
         int krPos = StringFind(resp, "\"kill_reason\":\"");
         if(krPos >= 0)
           {
            int krStart = krPos + 15;
            int krEnd = StringFind(resp, "\"", krStart);
            if(krEnd > krStart) reason = StringSubstr(resp, krStart, krEnd - krStart);
           }
         Alert("[IronRisk Service] KILL SIGNAL: ", reason);
         m_killed = true;
         return false;
        }
      
      // 401 Unauthorized
      if(StringFind(resp, "\"detail\":\"Invalid") >= 0 || StringFind(resp, "\"detail\": \"Invalid") >= 0)
        {
         Alert("[IronRisk Service] ERROR 401: Invalid or revoked API Token.");
         m_killed = true;
         return false;
        }
      
      // Log status
      if(StringFind(resp, "\"status\":\"NORMAL\"") >= 0)
         Print("[IR-Service] Heartbeat OK — NORMAL");
      else if(StringFind(resp, "\"status\":\"WARNING\"") >= 0)
         Print("[IR-Service] Heartbeat OK — WARNING");
      else if(StringFind(resp, "\"status\":\"CRITICAL\"") >= 0)
         Print("[IR-Service] Heartbeat OK — CRITICAL");
      
      return true;
     }
  };


//+------------------------------------------------------------------+
//| CStrategyManager: Fetches and manages strategy list from backend |
//+------------------------------------------------------------------+
struct SStrategy
  {
   long   magic;
   string name;
   long   associated_magics[];
  };

class CStrategyManager
  {
private:
   CHttpClient *m_http;
   string       m_basePath;
   string       m_token;
   SStrategy    m_strategies[];
   int          m_count;
   
public:
   CStrategyManager(CHttpClient *http, string basePath, string token)
      : m_http(http), m_basePath(basePath), m_token(token), m_count(0) {}
   
   int    Count()                  const { return m_count; }
   long   Magic(int i)             const { return (i >= 0 && i < m_count) ? m_strategies[i].magic : 0; }
   string Name(int i)              const { return (i >= 0 && i < m_count) ? m_strategies[i].name : ""; }
   
   void Refresh()
     {
      string resp = m_http.Get(m_basePath + "strategies/" + m_token);
      if(resp == "")
        {
         if(m_count == 0)
           {
            ArrayResize(m_strategies, 1);
            m_strategies[0].magic = 0;
            m_strategies[0].name = "Manual (Offline)";
            m_count = 1;
           }
         return;
        }
      
      string st[];
      int cnt = StringSplit(resp, ';', st);
      SStrategy ns[];
      ArrayResize(ns, cnt + 1);
      int nt = 0;
      
      for(int i = 0; i < cnt; i++)
        {
         if(st[i] == "") continue;
         string p[];
         int parts = StringSplit(st[i], '|', p);
         if(parts >= 2)
           {
            ns[nt].magic = StringToInteger(p[0]);
            ns[nt].name = p[1];
            if(parts >= 3 && p[2] != "")
              {
               string subm[];
               int scnt = StringSplit(p[2], ',', subm);
               ArrayResize(ns[nt].associated_magics, scnt);
               for(int m = 0; m < scnt; m++)
                  ns[nt].associated_magics[m] = StringToInteger(subm[m]);
              }
            else
              {
               ArrayResize(ns[nt].associated_magics, 1);
               ns[nt].associated_magics[0] = ns[nt].magic;
              }
            nt++;
           }
        }
      
      if(nt > 0)
        {
         ArrayResize(m_strategies, nt);
         m_count = nt;
         for(int i = 0; i < nt; i++)
           {
            m_strategies[i].magic = ns[i].magic;
            m_strategies[i].name  = ns[i].name;
            ArrayCopy(m_strategies[i].associated_magics, ns[i].associated_magics);
           }
         Print("[IR-Service] Loaded ", m_count, " strategies");
        }
     }
  };


//+------------------------------------------------------------------+
//| CIronRiskService: Main orchestrator                              |
//+------------------------------------------------------------------+
class CIronRiskService
  {
private:
   CConfigManager    *m_config;
   CHttpClient       *m_http;
   CAccountMonitor   *m_monitor;
   CTradeSyncer      *m_syncer;
   CHeartbeatSender  *m_heartbeat;
   CStrategyManager  *m_strategies;
   string             m_token;
   int                m_intervalMs;
   
public:
   CIronRiskService()
     {
      m_config     = NULL;
      m_http       = NULL;
      m_monitor    = NULL;
      m_syncer     = NULL;
      m_heartbeat  = NULL;
      m_strategies = NULL;
     }
   
   ~CIronRiskService()
     {
      Shutdown();
     }
   
   bool Initialize()
     {
      // 1. Resolve token
      m_config = new CConfigManager();
      m_token = m_config.ResolveToken(InpApiToken);
      
      if(m_token == "" || m_token == "PASTE_TOKEN_HERE")
        {
         Print("[IR-Service] ERROR: No valid API token found.");
         Print("[IR-Service] Please set the token in the Service inputs or place it in MQL5/Files/IronRisk/config.txt");
         return false;
        }
      
      // 2. Create HTTP client
      m_http = new CHttpClient(InpWebhookHost, InpWebhookPort, InpUseHTTPS);
      
      // 3. Create components
      m_monitor    = new CAccountMonitor();
      m_syncer     = new CTradeSyncer(m_http, API_BASE_PATH, m_token);
      m_heartbeat  = new CHeartbeatSender(m_http, API_BASE_PATH, m_token);
      m_strategies = new CStrategyManager(m_http, API_BASE_PATH, m_token);
      
      // 4. Set interval
      m_intervalMs = (InpTimerSec > 0 ? InpTimerSec : 5) * 1000;
      
      // 5. Initial strategy load
      m_strategies.Refresh();
      
      Print("[IR-Service] Initialized — Host: ", InpWebhookHost, 
            " | Port: ", InpWebhookPort, 
            " | HTTPS: ", (InpUseHTTPS ? "Yes" : "No"),
            " | Interval: ", InpTimerSec, "s",
            " | Account: ", AccountInfoInteger(ACCOUNT_LOGIN));
      
      return true;
     }
   
   void Run()
     {
      int strategyCycle = 0;
      
      while(!IsStopped())
        {
         // 1. Refresh account data
         m_monitor.Refresh();
         
         // 2. Sync closed deals (magic 0 = all)
         m_syncer.SyncClosedDeals(0);
         
         // 3. Send heartbeat (magic 0 = global portfolio)
         m_heartbeat.Send(
            0,
            m_monitor.Equity(),
            m_monitor.Drawdown(),
            m_monitor.OpenTrades(),
            m_monitor.FloatingMapJSON()
         );
         
         // 4. Check kill signal
         if(m_heartbeat.IsKilled())
           {
            Print("[IR-Service] Kill signal received. Stopping service.");
            break;
           }
         
         // 5. Refresh strategies every 30 seconds
         strategyCycle += InpTimerSec;
         if(strategyCycle >= 30)
           {
            strategyCycle = 0;
            m_strategies.Refresh();
           }
         
         // 6. Sleep until next cycle
         Sleep(m_intervalMs);
        }
     }
   
   void Shutdown()
     {
      if(CheckPointer(m_config)     == POINTER_DYNAMIC) { delete m_config;     m_config     = NULL; }
      if(CheckPointer(m_http)       == POINTER_DYNAMIC) { delete m_http;       m_http       = NULL; }
      if(CheckPointer(m_monitor)    == POINTER_DYNAMIC) { delete m_monitor;    m_monitor    = NULL; }
      if(CheckPointer(m_syncer)     == POINTER_DYNAMIC) { delete m_syncer;     m_syncer     = NULL; }
      if(CheckPointer(m_heartbeat)  == POINTER_DYNAMIC) { delete m_heartbeat;  m_heartbeat  = NULL; }
      if(CheckPointer(m_strategies) == POINTER_DYNAMIC) { delete m_strategies; m_strategies = NULL; }
      Print("[IR-Service] Shutdown complete.");
     }
  };


//+------------------------------------------------------------------+
//| Service Entry Point                                              |
//+------------------------------------------------------------------+
void OnStart()
  {
   Print("═══════════════════════════════════════════════════");
   Print("  IronRisk Background Connector v1.00");
   Print("  https://ironrisk.pro");
   Print("═══════════════════════════════════════════════════");
   
   CIronRiskService service;
   
   if(!service.Initialize())
     {
      Print("[IR-Service] Initialization failed. Service will not start.");
      return;
     }
   
   service.Run();
   service.Shutdown();
  }
//+------------------------------------------------------------------+

