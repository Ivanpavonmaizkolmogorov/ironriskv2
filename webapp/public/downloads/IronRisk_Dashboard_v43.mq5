//|                                    IronRisk_Dashboard_v43.mq5  |
//|                                  Copyright 2026, IronRisk System |
//|                                             https://ironrisk.pro |
//+------------------------------------------------------------------+
#property copyright "IronRisk System"
#property link      "https://ironrisk.pro"
#property version   "43.00"

// HYBRID ARCHITECTURE - Option A:
//   Phase 1 (Bootstrap): EA on any chart → creates IronRisk_PnL symbol
//   Phase 2 (Dashboard): EA on IronRisk_PnL → panel overlay + native PnL chart
// v18: Persistent M1 bars via CustomRatesReplace (survives MT5 restarts)

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
#define PNL_SYMBOL "IronRisk_PnL"

// --- User Inputs ---
input string   InpApiToken    = "PEGAR_TOKEN_AQUI"; // API Token de Trading Account
input string   InpWebhookHost = "127.0.0.1";        // Servidor Backend (sin http://)
input int      InpWebhookPort = 8000;               // Puerto (8000 dev, 443 prod)
input string   InpWebhookPath = "/api/live/";       // Ruta API Base
input bool     InpUseHTTPS    = false;              // Usar HTTPS
input int      InpTimerSec    = 5;                  // Frecuencia Heartbeat (segundos)

// --- Global Types ---
struct SStrategyNode {
   long magic;
   string name;
};

//+------------------------------------------------------------------+
//| OOP Dashboard Layout Model                                       |
//+------------------------------------------------------------------+
class CDashboardWidget
  {
public:
   string id;
   string type;
   string title;
   string value_key;
   color accent;
   string style; // "simple" or "progress_bar"
   
   CDashboardWidget() { id=""; type="metric"; title="Metric"; value_key=""; accent=clrWhite; style="simple"; }
  };

class CDashboardLayout
  {
private:
   CDashboardWidget *m_widgets[];
   int m_count;
public:
   CDashboardLayout() { m_count=0; }
   ~CDashboardLayout() { Clear(); }
   
   void Clear()
     {
      for(int i=0; i<m_count; i++) 
         if(CheckPointer(m_widgets[i])==POINTER_DYNAMIC) delete m_widgets[i];
      ArrayResize(m_widgets, 0);
      m_count = 0;
     }
     
   int Count() { return m_count; }
   CDashboardWidget* GetWidget(int idx) { if(idx>=0 && idx<m_count) return m_widgets[idx]; return NULL; }
   
   void ParseJSON(string json_str)
     {
      Clear();
      int wStart = StringFind(json_str, "\"widgets\"");
      if(wStart < 0) return;
      
      int pos = wStart;
      while(true)
        {
         int objStart = StringFind(json_str, "{", pos);
         if(objStart < 0) break;
         
         int arrayEnd = StringFind(json_str, "]", pos);
         if(arrayEnd >= 0 && arrayEnd < objStart) break;
         
         int objEnd = StringFind(json_str, "}", objStart);
         if(objEnd < 0) break;
         
         string objStr = StringSubstr(json_str, objStart, objEnd - objStart + 1);
         CDashboardWidget *w = new CDashboardWidget();
         w.id = GetJsonString(objStr, "\"id\"");
         w.type = GetJsonString(objStr, "\"type\"");
         w.title = GetJsonString(objStr, "\"title\"");
         w.value_key = GetJsonString(objStr, "\"value_key\"");
         w.style = GetJsonString(objStr, "\"style\"");
         if(w.style == "") w.style = "simple";
         
         string cStr = GetJsonString(objStr, "\"color\"");
         w.accent = ParseColorStr(cStr);
         
         ArrayResize(m_widgets, m_count + 1);
         m_widgets[m_count] = w;
         m_count++;
         
         pos = objEnd + 1;
        }
     }
     
private:
   string GetJsonString(string data, string key)
     {
      int p = StringFind(data, key);
      if(p < 0) return "";
      int colon = StringFind(data, ":", p);
      if(colon < 0) return "";
      int q1 = StringFind(data, "\"", colon);
      if(q1 < 0) return "";
      int q2 = StringFind(data, "\"", q1+1);
      if(q2 < 0) return "";
      return StringSubstr(data, q1+1, q2 - q1 - 1);
     }
     
   color ParseColorStr(string c)
     {
      string low = c; StringToLower(low);
      if(low == "green") return clrLimeGreen;
      if(low == "red") return clrCrimson;
      if(low == "yellow") return clrGold;
      if(low == "blue") return clrDodgerBlue;
      if(low == "purple") return clrMediumPurple;
      if(low == "orange") return clrDarkOrange;
      if(low == "cyan") return clrCyan;
      return clrWhite;
     }
  };

CDashboardLayout *g_Layout;

// --- Global Variables ---
SStrategyNode g_Strategies[];
int g_TotalStrategies = 0;
long g_ActiveMagic = 0;
string g_ActiveName = "Manual (0)";
bool g_IsDashboardMode = false; // true when running ON IronRisk_PnL

// Status from Server
string g_ServerStatus = "WAITING";
double g_MaxDrawdownLimit = 0.0;
double g_DailyLossLimit = 0.0;

// Dynamic risk config from server (max 5 variables)
struct SRiskVar {
   string key;
   string label;
   bool   enabled;
   double limit;
   double current;
   int    ctx_percentile;
   string ctx_label;
   color  ctx_color;
};
SRiskVar g_RiskVars[5];
int      g_RiskVarCount = 0;

void InitDefaultRiskVars()
  {
   g_RiskVarCount = 5;
   g_RiskVars[0].key="max_drawdown";      g_RiskVars[0].label="Current DD";      g_RiskVars[0].enabled=true;  g_RiskVars[0].limit=0; g_RiskVars[0].current=0; g_RiskVars[0].ctx_percentile=-1; g_RiskVars[0].ctx_label=""; g_RiskVars[0].ctx_color=clrGray;
   g_RiskVars[1].key="daily_loss";        g_RiskVars[1].label="Daily Loss";      g_RiskVars[1].enabled=true;  g_RiskVars[1].limit=0; g_RiskVars[1].current=0; g_RiskVars[1].ctx_percentile=-1; g_RiskVars[1].ctx_label=""; g_RiskVars[1].ctx_color=clrGray;
   g_RiskVars[2].key="consecutive_losses";g_RiskVars[2].label="Consec. Losses";  g_RiskVars[2].enabled=false; g_RiskVars[2].limit=0; g_RiskVars[2].current=0; g_RiskVars[2].ctx_percentile=-1; g_RiskVars[2].ctx_label=""; g_RiskVars[2].ctx_color=clrGray;
   g_RiskVars[3].key="stagnation_days";   g_RiskVars[3].label="Stagn. Days";     g_RiskVars[3].enabled=false; g_RiskVars[3].limit=0; g_RiskVars[3].current=0; g_RiskVars[3].ctx_percentile=-1; g_RiskVars[3].ctx_label=""; g_RiskVars[3].ctx_color=clrGray;
   g_RiskVars[4].key="stagnation_trades"; g_RiskVars[4].label="Stagn. Trades";   g_RiskVars[4].enabled=false; g_RiskVars[4].limit=0; g_RiskVars[4].current=0; g_RiskVars[4].ctx_percentile=-1; g_RiskVars[4].ctx_label=""; g_RiskVars[4].ctx_color=clrGray;
  }

// Local metrics
double g_LocalFloatingPnL = 0.0;
double g_LocalDrawdown = 0.0;
int g_LocalOpenTrades = 0;
int g_RealClosedTrades = 0;  // Total closed deals from MT5 history
double g_LastFedPnL = EMPTY_VALUE; // Prevent nervous ticks

// Trailing DD
double g_PeakPnL = 0.0;
double g_CumulativeClosedPnL = 0.0; // Running total of closed deals for active strategy
double g_StrategyEquity = 0.0;      // = g_CumulativeClosedPnL + g_LocalFloatingPnL

// Live bar tracking (for FeedPnLUpdate)
datetime g_CurrentBarTime = 0;
double   g_CurrentBarOpen = 0.0;
double   g_CurrentBarHigh = 0.0;
double   g_CurrentBarLow  = 0.0;
long     g_CurrentBarTickVol = 0;

// Trailing DD floor
bool g_ShowFloorLine = true;
int  g_FloorSegCount = 0;
int  g_StratScrollOff = 0;
string g_StratFilter = "";  // Search filter for strategy buttons  // First visible strategy index
int  g_RiskScrollOff  = 0;  // First visible risk card index
bool g_ShowTradeLog = false;   // Trade log overlay toggle
int  g_TradeLogScroll = 0;     // Scroll offset for trade log

// Chart Popup Overlay
string g_ActiveChartMetric = "";
int    g_ChartMetricCardId = -1;
string g_ChartFileName = "";


//+------------------------------------------------------------------+
//| CServerClient: HTTP via Wininet                                  |
//+------------------------------------------------------------------+
class CServerClient
  {
private:
   string m_host, m_path, m_token;
   int    m_port;
   bool   m_https;
public:
   CServerClient(string host, int port, string path, bool https, string token)
     { m_host=host; m_port=port; m_path=path; m_https=https; m_token=token; }
   ~CServerClient() {}
   bool   SendHeartbeat(long magic, double pnl, double dd, int trades);
   string FetchStrategies();
   bool   SyncClosedDeals(long magic);
   string DownloadRiskChart(long magic, string metric_name, double val);
   string FetchLayoutConfig(long magic);
  };

string CServerClient::FetchLayoutConfig(long magic)
  {
   string ep = m_path + "layout_config/" + m_token + "/" + IntegerToString(magic);
   int hI = InternetOpenW("IronRisk_EA", INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
   if(!hI) return "";
   int hC = InternetConnectW(hI, m_host, m_port, "", "", INTERNET_SERVICE_HTTP, 0, 0);
   if(!hC) { InternetCloseHandle(hI); return ""; }
   uint fl = INTERNET_FLAG_RELOAD; if(m_https) fl |= INTERNET_FLAG_SECURE;
   int hR = HttpOpenRequestW(hC, "GET", ep, "HTTP/1.1", NULL, NULL, (int)fl, 0);
   if(!hR) { InternetCloseHandle(hC); InternetCloseHandle(hI); return ""; }
   char opt[]; bool res = HttpSendRequestW(hR, "", 0, opt, 0);
   string resp = "";
   if(res) { char buf[1024]; int rd=0; while(InternetReadFile(hR,buf,1024,rd)&&rd>0) resp+=CharArrayToString(buf,0,rd,CP_UTF8); }
   InternetCloseHandle(hR); InternetCloseHandle(hC); InternetCloseHandle(hI);
   return resp;
  }

string CServerClient::FetchStrategies()
  {
   string endpoint = m_path + "strategies/" + m_token;
   int hI = InternetOpenW("IronRisk_EA", INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
   if(!hI) return "";
   int hC = InternetConnectW(hI, m_host, m_port, "", "", INTERNET_SERVICE_HTTP, 0, 0);
   if(!hC) { InternetCloseHandle(hI); return ""; }
   uint fl = INTERNET_FLAG_RELOAD; if(m_https) fl |= INTERNET_FLAG_SECURE;
   int hR = HttpOpenRequestW(hC, "GET", endpoint, "HTTP/1.1", NULL, NULL, (int)fl, 0);
   if(!hR) { InternetCloseHandle(hC); InternetCloseHandle(hI); return ""; }
   char opt[]; bool res = HttpSendRequestW(hR, "", 0, opt, 0);
   string resp = "";
   if(res) { char buf[1024]; int rd=0; while(InternetReadFile(hR,buf,1024,rd)&&rd>0) resp+=CharArrayToString(buf,0,rd,CP_UTF8); }
   InternetCloseHandle(hR); InternetCloseHandle(hC); InternetCloseHandle(hI);
   return resp;
  }

string CServerClient::DownloadRiskChart(long magic, string metric_name, double val)
  {
   string ep = m_path + "chart/" + m_token + "/" + IntegerToString(magic) + "/" + metric_name + "?value=" + DoubleToString(val, 2);
   int hI = InternetOpenW("IronRisk_EA", INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
   if(!hI) return "";
   int hC = InternetConnectW(hI, m_host, m_port, "", "", INTERNET_SERVICE_HTTP, 0, 0);
   if(!hC) { InternetCloseHandle(hI); return ""; }
   uint fl = INTERNET_FLAG_RELOAD; if(m_https) fl |= INTERNET_FLAG_SECURE;
   int hR = HttpOpenRequestW(hC, "GET", ep, "HTTP/1.1", NULL, NULL, (int)fl, 0);
   if(!hR) { InternetCloseHandle(hC); InternetCloseHandle(hI); return ""; }
   
   string finalName = "";
   char opt[];
   bool res = HttpSendRequestW(hR, "", 0, opt, 0);
   if(res)
     {
      // Save directly to MQL5/Files/IronRisk/chart_*.bmp with timestamp to bypass MT5 cache
      FolderCreate("IronRisk");
      string fileName = "IronRisk\\chart_" + metric_name + "_" + IntegerToString(TimeCurrent()) + ".bmp";
      int hFile = FileOpen(fileName, FILE_WRITE|FILE_BIN);
        
      if(hFile != INVALID_HANDLE)
        {
         char buf[4096]; int rd=0;
         while(InternetReadFile(hR, buf, 4096, rd) && rd > 0)
           {
            FileWriteArray(hFile, buf, 0, rd);
           }
         FileClose(hFile);
         finalName = "\\Files\\" + fileName;
        }
     }
   InternetCloseHandle(hR); InternetCloseHandle(hC); InternetCloseHandle(hI);
   return finalName;
  }

bool CServerClient::SyncClosedDeals(long magic)
  {
   // Use MT5 GlobalVariable to remember the last sync time for this magic and token
   string gvName = "IR_Sync_" + m_token + "_" + IntegerToString(magic);
   datetime lastSync = 0;
   if(GlobalVariableCheck(gvName)) lastSync = (datetime)GlobalVariableGet(gvName);
   
   if(!HistorySelect(lastSync, TimeCurrent()+86400)) return false;
   int total = HistoryDealsTotal();
   if(total == 0) return true;
   
   // Build JSON array of deals
   string jsonTrades = "";
   int count = 0;
   datetime maxTime = lastSync;
   
   for(int d = 0; d < total; d++)
     {
      ulong tk = HistoryDealGetTicket(d);
      if(tk <= 0) continue;
      long mag = HistoryDealGetInteger(tk, DEAL_MAGIC);
      if(mag != magic && magic != 0) continue; 
      
      long entry = HistoryDealGetInteger(tk, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT) continue;
      
      datetime dealTime = (datetime)HistoryDealGetInteger(tk, DEAL_TIME);
      if(dealTime < lastSync) continue;
      
      double profit = HistoryDealGetDouble(tk, DEAL_PROFIT)
                      + HistoryDealGetDouble(tk, DEAL_SWAP)
                      + HistoryDealGetDouble(tk, DEAL_COMMISSION);
      
      string sym = HistoryDealGetString(tk, DEAL_SYMBOL);
      double vol = HistoryDealGetDouble(tk, DEAL_VOLUME);
      
      string tObj = "{\"ticket\":"+IntegerToString(tk)+
                    ",\"magic_number\":"+IntegerToString(mag)+
                    ",\"symbol\":\""+sym+"\""+
                    ",\"volume\":"+DoubleToString(vol,2)+
                    ",\"profit\":"+DoubleToString(profit,2)+
                    ",\"close_time\":"+IntegerToString((int)dealTime)+"}";
                    
      if(count > 0) jsonTrades += ",";
      jsonTrades += tObj;
      count++;
      if(dealTime > maxTime) maxTime = dealTime;
      
      // Limit to 500 deals per batch
      if(count >= 500) break;
     }
     
   if(count == 0) 
     {
      GlobalVariableSet(gvName, (double)(TimeCurrent()));
      return true;
     }
     
   // Send POST /api/live/sync-trades
   string payload = "{\"api_token\":\""+m_token+"\",\"trades\":["+jsonTrades+"]}";
   char post[]; StringToCharArray(payload, post, 0, WHOLE_ARRAY, CP_UTF8);
   int sz = ArraySize(post)-1;
   string hdr = "Content-Type: application/json\r\n";
   string ep = m_path + "sync-trades";
   
   int hI = InternetOpenW("IronRisk_EA", INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
   if(!hI) return false;
   int hC = InternetConnectW(hI, m_host, m_port, "", "", INTERNET_SERVICE_HTTP, 0, 0);
   if(!hC) { InternetCloseHandle(hI); return false; }
   uint fl = INTERNET_FLAG_RELOAD; if(m_https) fl |= INTERNET_FLAG_SECURE;
   int hR = HttpOpenRequestW(hC, "POST", ep, "HTTP/1.1", NULL, NULL, (int)fl, 0);
   if(!hR) { InternetCloseHandle(hC); InternetCloseHandle(hI); return false; }
   
   bool res = HttpSendRequestW(hR, hdr, StringLen(hdr), post, sz);
   if(res)
     {
      GlobalVariableSet(gvName, (double)(maxTime + 1));
     }
   InternetCloseHandle(hR); InternetCloseHandle(hC); InternetCloseHandle(hI);
   return res;
  }

bool CServerClient::SendHeartbeat(long magic, double pnl, double dd, int trades)
  {
   // Historic metrics (consec_losses, stagnation) are calculated server-side now (SSOT)
   string json = "{\"api_token\":\""+m_token+"\",\"magic_number\":"+IntegerToString(magic)
      +",\"current_pnl\":"+DoubleToString(pnl,2)+",\"current_drawdown\":"+DoubleToString(dd,2)
      +",\"open_trades\":"+IntegerToString(trades)
      +",\"consecutive_losses\":0,\"stagnation_days\":0,\"stagnation_trades\":0}";
   char post[]; StringToCharArray(json, post, 0, WHOLE_ARRAY, CP_UTF8);
   int sz = ArraySize(post)-1;
   string hdr = "Content-Type: application/json\r\n";
   string ep = m_path + "heartbeat";
   int hI = InternetOpenW("IronRisk_EA", INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
   if(!hI) return false;
   int hC = InternetConnectW(hI, m_host, m_port, "", "", INTERNET_SERVICE_HTTP, 0, 0);
   if(!hC) { InternetCloseHandle(hI); return false; }
   uint fl = INTERNET_FLAG_RELOAD; if(m_https) fl |= INTERNET_FLAG_SECURE;
   int hR = HttpOpenRequestW(hC, "POST", ep, "HTTP/1.1", NULL, NULL, (int)fl, 0);
   if(!hR) { InternetCloseHandle(hC); InternetCloseHandle(hI); return false; }
   bool res = HttpSendRequestW(hR, hdr, StringLen(hdr), post, sz);
   if(res)
     {
      string resp=""; char buf[1024]; int rd=0;
      while(InternetReadFile(hR,buf,1024,rd)&&rd>0) resp+=CharArrayToString(buf,0,rd,CP_UTF8);
      if(StringFind(resp,"\"status\":\"NORMAL\"")>=0) g_ServerStatus="NORMAL";
      else if(StringFind(resp,"\"status\":\"WARNING\"")>=0) g_ServerStatus="WARNING";
      else if(StringFind(resp,"\"status\":\"CRITICAL\"")>=0) g_ServerStatus="CRITICAL";
      int idx;
      idx=StringFind(resp,"\"max_drawdown_limit\":"); if(idx>=0){int s=idx+21; int e=StringFind(resp,",",s); if(e<0)e=StringFind(resp,"}",s); if(e>s) g_MaxDrawdownLimit=StringToDouble(StringSubstr(resp,s,e-s));}
      idx=StringFind(resp,"\"daily_loss_limit\":"); if(idx>=0){int s=idx+19; int e=StringFind(resp,",",s); if(e<0)e=StringFind(resp,"}",s); if(e>s) g_DailyLossLimit=StringToDouble(StringSubstr(resp,s,e-s));}
       ParseRiskConfig(resp);
       ParseRiskContext(resp);
     }
   InternetCloseHandle(hR); InternetCloseHandle(hC); InternetCloseHandle(hI);
   return res;
  }

void ParseRiskContext(string resp)
  {
   int rcStart = StringFind(resp, "\"risk_context\"");
   if(rcStart < 0) return;
   string rcBlock = StringSubstr(resp, rcStart);
   for(int i=0; i<g_RiskVarCount; i++)
     {
      string search = "\"" + g_RiskVars[i].key + "\":{" ;
      int pos = StringFind(rcBlock, search);
      if(pos < 0) { search = "\"" + g_RiskVars[i].key + "\": {"; pos = StringFind(rcBlock, search); }
      if(pos < 0) continue;
      int objEnd = StringFind(rcBlock, "}", pos);
      if(objEnd < 0) continue;
      string objStr = StringSubstr(rcBlock, pos, objEnd - pos + 1);
      
      int pPos = StringFind(objStr, "\"percentile\"");
      if(pPos >= 0)
        {
         int cc = StringFind(objStr, ":", pPos + 12);
         if(cc >= 0)
           {
            int ce = StringFind(objStr, ",", cc);
            if(ce < 0) ce = StringFind(objStr, "}", cc);
            string pStr = StringSubstr(objStr, cc+1, ce-cc-1);
            if(StringFind(pStr, "null") >= 0) g_RiskVars[i].ctx_percentile = -1;
            else g_RiskVars[i].ctx_percentile = (int)StringToInteger(pStr);
           }
        }
      
      int lPos = StringFind(objStr, "\"label\"");
      if(lPos >= 0)
        {
         int cc = StringFind(objStr, ":", lPos + 7);
         if(cc >= 0)
           {
            int cs = StringFind(objStr, "\"", cc);
            if(cs >= 0)
              {
               int ce = StringFind(objStr, "\"", cs+1);
               if(ce >= 0) g_RiskVars[i].ctx_label = StringSubstr(objStr, cs+1, ce-cs-1);
              }
           }
        }
        
      int cPos = StringFind(objStr, "\"color\"");
      if(cPos >= 0)
        {
         int cc = StringFind(objStr, ":", cPos + 7);
         if(cc >= 0)
           {
            int cs = StringFind(objStr, "\"", cc);
            if(cs >= 0)
              {
               int ce = StringFind(objStr, "\"", cs+1);
               if(ce >= 0)
                 {
                  string cStr = StringSubstr(objStr, cs+1, ce-cs-1);
                  if(cStr == "green") g_RiskVars[i].ctx_color = clrLimeGreen;
                  else if(cStr == "yellow") g_RiskVars[i].ctx_color = clrGold;
                  else if(cStr == "red") g_RiskVars[i].ctx_color = clrCrimson;
                  else g_RiskVars[i].ctx_color = clrGray;
                 }
              }
           }
        }
     }
  }

CServerClient *AppServer;

void ParseRiskConfig(string resp)
  {
   int rcStart = StringFind(resp, "\"risk_config\"");
   if(rcStart < 0) return;
   string rcBlock = StringSubstr(resp, rcStart);
   for(int i=0; i<g_RiskVarCount; i++)
     {
      string search = "\"" + g_RiskVars[i].key + "\":{" ;
      int pos = StringFind(rcBlock, search);
      if(pos < 0) { search = "\"" + g_RiskVars[i].key + "\": {"; pos = StringFind(rcBlock, search); }
      if(pos < 0) continue;
      int objEnd = StringFind(rcBlock, "}", pos);
      if(objEnd < 0) continue;
      string objStr = StringSubstr(rcBlock, pos, objEnd - pos + 1);
      int ePos = StringFind(objStr, "\"enabled\"");
      if(ePos >= 0)
         g_RiskVars[i].enabled = (StringFind(objStr, "true", ePos) >= 0);
      int lPos = StringFind(objStr, "\"limit\"");
      if(lPos >= 0)
        {
         int cp = StringFind(objStr, ":", lPos + 6);
         if(cp >= 0)
           {
            int ve = StringFind(objStr, "}", cp);
       int cPos = StringFind(objStr, "\"current\"");
       if(cPos >= 0)
         {
          int cc = StringFind(objStr, ":", cPos + 9);
          if(cc >= 0)
            {
             int ce2 = StringFind(objStr, "}", cc);
             int cm = StringFind(objStr, ",", cc);
             if(cm >= 0 && cm < ce2) ce2 = cm;
             if(ce2 > cc + 1) g_RiskVars[i].current = StringToDouble(StringSubstr(objStr, cc+1, ce2-cc-1));
            }
         }
            int ce = StringFind(objStr, ",", cp);
            if(ce >= 0 && ce < ve) ve = ce;
            if(ve > cp + 1) g_RiskVars[i].limit = StringToDouble(StringSubstr(objStr, cp+1, ve-cp-1));
           }
        }
     }
   for(int i=0; i<g_RiskVarCount; i++)
     {
      if(g_RiskVars[i].key=="max_drawdown" && g_RiskVars[i].enabled) g_MaxDrawdownLimit = g_RiskVars[i].limit;
      if(g_RiskVars[i].key=="daily_loss" && g_RiskVars[i].enabled) g_DailyLossLimit = g_RiskVars[i].limit;
     }
  }

// Backend computes all current values — no local calculation needed
/* REMOVED: GetRiskVarCurrent — server sends current values in risk_config
double GetRiskVarCurrent(int idx)
  {
   string k = g_RiskVars[idx].key;
   if(k == "max_drawdown")
      return (g_PeakPnL > g_StrategyEquity) ? (g_PeakPnL - g_StrategyEquity) : 0.0;
   if(k == "daily_loss")
      return (g_LocalClosedToday < 0) ? MathAbs(g_LocalClosedToday) : 0.0;
   // For consecutive_losses, stagnation: not tracked in EA yet
   return 0.0;
  }
*/


//+------------------------------------------------------------------+
//| Custom Symbol Bootstrap                                          |
//+------------------------------------------------------------------+
bool EnsurePnLSymbol()
  {
   if(!CustomSymbolCreate(PNL_SYMBOL, "\\Custom"))
     {
      if(SymbolInfoInteger(PNL_SYMBOL, SYMBOL_CUSTOM) != 1)
        { Print("[IR] Cannot create ", PNL_SYMBOL); return false; }
     }
   CustomSymbolSetInteger(PNL_SYMBOL, SYMBOL_DIGITS, 2);
   CustomSymbolSetString(PNL_SYMBOL, SYMBOL_DESCRIPTION, "IronRisk Floating PnL");
   CustomSymbolSetString(PNL_SYMBOL, SYMBOL_CURRENCY_PROFIT, "USD");
   CustomSymbolSetString(PNL_SYMBOL, SYMBOL_CURRENCY_BASE, "USD");
   CustomSymbolSetString(PNL_SYMBOL, SYMBOL_CURRENCY_MARGIN, "USD");
   CustomSymbolSetDouble(PNL_SYMBOL, SYMBOL_POINT, 0.01);
   CustomSymbolSetDouble(PNL_SYMBOL, SYMBOL_TRADE_TICK_SIZE, 0.01);
   CustomSymbolSetDouble(PNL_SYMBOL, SYMBOL_TRADE_TICK_VALUE, 1.0);
   SymbolSelect(PNL_SYMBOL, true);
   return true;
  }

void ClearSymbolHistory()
  {
   // Delete all ticks/rates from the custom symbol to start fresh
   CustomRatesDelete(PNL_SYMBOL, 0, TimeCurrent()+86400);
   CustomTicksDelete(PNL_SYMBOL, 0, (long)(TimeCurrent()+86400)*1000);
  }

void ClearFloorSegments()
  {
   ObjectsDeleteAll(0, "IR_FS_");
   g_FloorSegCount = 0;
  }

void DrawFloorSegment(datetime t1, datetime t2, double level, color clr=clrCrimson)
  {
   if(!g_ShowFloorLine) return;
   string name = "IR_FS_" + IntegerToString(g_FloorSegCount++);
   ObjectCreate(0, name, OBJ_TREND, 0, t1, level, t2, level);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_DOT);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, name, OBJPROP_RAY_RIGHT, false);
   ObjectSetInteger(0, name, OBJPROP_BACK, true);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
  }

void DrawTrailingFloor(MqlRates &rates[], int count)
  {
   if(g_MaxDrawdownLimit <= 0 || count <= 0) return;
   ClearFloorSegments();
   double running_peak = 0.0;
   double last_floor = -999999.0;
   datetime seg_start = rates[0].time;
   for(int i = 0; i < count; i++)
     {
      if(rates[i].close > running_peak)
        {
         running_peak = rates[i].close;
         double new_floor = running_peak - g_MaxDrawdownLimit;
         if(new_floor != last_floor)
           {
            if(last_floor > -999990.0)
               DrawFloorSegment(seg_start, rates[i].time, last_floor);
            seg_start = rates[i].time;
            last_floor = new_floor;
           }
        }
     }
   // Final segment with RAY_RIGHT
   if(last_floor > -999990.0)
     {
      DrawFloorSegment(seg_start, TimeCurrent(), last_floor);
      string lastName = "IR_FS_" + IntegerToString(g_FloorSegCount - 1);
      ObjectSetInteger(0, lastName, OBJPROP_RAY_RIGHT, true);
      ObjectSetInteger(0, lastName, OBJPROP_WIDTH, 2);
      ObjectSetInteger(0, lastName, OBJPROP_STYLE, STYLE_DASH);
      // HLINE at same level for native Y-axis price label
      if(ObjectFind(0,"IR_DDFLOOR")<0)
        {
         ObjectCreate(0,"IR_DDFLOOR",OBJ_HLINE,0,0,last_floor);
         ObjectSetInteger(0,"IR_DDFLOOR",OBJPROP_COLOR,C'130,0,0');
         ObjectSetInteger(0,"IR_DDFLOOR",OBJPROP_STYLE,STYLE_SOLID);
         ObjectSetInteger(0,"IR_DDFLOOR",OBJPROP_WIDTH,0);
         ObjectSetInteger(0,"IR_DDFLOOR",OBJPROP_BACK,false);
         ObjectSetInteger(0,"IR_DDFLOOR",OBJPROP_SELECTABLE,false);
        }
      ObjectSetDouble(0,"IR_DDFLOOR",OBJPROP_PRICE,last_floor);
     }
  }

//+------------------------------------------------------------------+
//| FeedPnLUpdate: Live tick + persistent M1 bar                     |
//+------------------------------------------------------------------+

void FeedPnLUpdate(double val)
  {
   datetime now = TimeCurrent();
   datetime bar_time = now - (now % 60);
   bool is_new_bar = (bar_time != g_CurrentBarTime);
   
   // 1. Feed tick. MANDATORY every cycle to prevent MT5 from thinking the symbol is dead
   // and dropping older historical bars from the visual display (causing them to flash).
   MqlTick t[1];
   ZeroMemory(t[0]);
   t[0].time     = now;
   t[0].time_msc = (long)now * 1000;
   t[0].bid  = val;
   t[0].ask  = val;
   t[0].last = val;
   t[0].volume = 1;
   t[0].flags = TICK_FLAG_BID|TICK_FLAG_ASK|TICK_FLAG_LAST;
   CustomTicksAdd(PNL_SYMBOL, t);
   
   // 2. Write/update current M1 bar 
   if(is_new_bar)
     {
      // New minute → new bar (native tick construction, no phantom bridging)
      g_CurrentBarTime = bar_time;
      g_CurrentBarOpen = val;
      g_CurrentBarHigh = val;
      g_CurrentBarLow  = val;
      g_CurrentBarTickVol = 1;
     }
   else
     {
      // Same minute → update OHLC
      if(val > g_CurrentBarHigh) g_CurrentBarHigh = val;
      if(val < g_CurrentBarLow)  g_CurrentBarLow  = val;
      g_CurrentBarTickVol++;
     }
    
   MqlRates r[1];
   r[0].time        = g_CurrentBarTime;
   r[0].open        = g_CurrentBarOpen;
   r[0].high        = g_CurrentBarHigh;
   r[0].low         = g_CurrentBarLow;
   r[0].close       = val;
   r[0].tick_volume = g_CurrentBarTickVol;
   r[0].spread      = 0;
   r[0].real_volume = 0;
   CustomRatesUpdate(PNL_SYMBOL, r, 1);
  }

//+------------------------------------------------------------------+
//| SeedHistoricalEquity: Persistent M1 bars from deal history       |
//+------------------------------------------------------------------+
void SeedHistoricalEquity()
  {
   // Clear all previous data and rebuild from deal history
   ClearSymbolHistory();
   
   if(!HistorySelect(0, TimeCurrent())) return;
   int total = HistoryDealsTotal();
   if(total == 0)
     {
      FeedPnLUpdate(0.0);
      Print("[IR] No deals found, equity = 0.00");
      return;
     }
   
   // Build array of M1 bars from closed deals
   MqlRates rates[];
   int rateCount = 0;
   double running_pnl = 0.0;
   double hist_peak = 0.0;
   double prev_pnl = 0.0;
   
   for(int d = 0; d < total; d++)
     {
      ulong tk = HistoryDealGetTicket(d);
      if(tk <= 0) continue;
      
      long entry = HistoryDealGetInteger(tk, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT) continue;
      
      datetime deal_time = (datetime)HistoryDealGetInteger(tk, DEAL_TIME);
      datetime bar_time = deal_time - (deal_time % 60); // Round to M1 boundary
      
      // ANCHOR PREVENTATIVE MEASURE: 
      // Always insert a $0.00 bar at the very chronological beginning of the account's life
      // Even if this particular strategy didn't trade until months later, anchoring it overrides
      // MT5's background cache leakage from other tabs viewing the global PnL.
      if(rateCount == 0)
        {
         rateCount++;
         ArrayResize(rates, rateCount, 256);
         rates[0].time        = bar_time; // Oldest possible deal from any magic
         rates[0].open        = 0.0;
         rates[0].close       = 0.0;
         rates[0].high        = 0.0;
         rates[0].low         = 0.0;
         rates[0].tick_volume = 1;
         rates[0].spread      = 0;
         rates[0].real_volume = 0;
        }
        
      long mag = HistoryDealGetInteger(tk, DEAL_MAGIC);
      if(g_ActiveMagic != 0 && mag != g_ActiveMagic) continue;
      
      double deal_pnl = HistoryDealGetDouble(tk, DEAL_PROFIT)
                        + HistoryDealGetDouble(tk, DEAL_SWAP)
                        + HistoryDealGetDouble(tk, DEAL_COMMISSION);
      
      prev_pnl = running_pnl;
      running_pnl += deal_pnl;
       if(running_pnl > hist_peak) hist_peak = running_pnl;
      
      // Check if last bar has the same timestamp (multiple deals in same minute)
      if(rateCount > 0 && rates[rateCount-1].time == bar_time)
        {
         // Merge into existing bar
         rates[rateCount-1].close = running_pnl;
         rates[rateCount-1].high = MathMax(rates[rateCount-1].high, MathMax(prev_pnl, running_pnl));
         rates[rateCount-1].low  = MathMin(rates[rateCount-1].low,  MathMin(prev_pnl, running_pnl));
         rates[rateCount-1].tick_volume++;
        }
      else
        {
         // New bar
         rateCount++;
         ArrayResize(rates, rateCount, 256); // reserve blocks of 256
         rates[rateCount-1].time        = bar_time;
         rates[rateCount-1].open        = prev_pnl;
         rates[rateCount-1].close       = running_pnl;
         rates[rateCount-1].high        = MathMax(prev_pnl, running_pnl);
         rates[rateCount-1].low         = MathMin(prev_pnl, running_pnl);
         rates[rateCount-1].tick_volume = 1;
         rates[rateCount-1].spread      = 0;
         rates[rateCount-1].real_volume = 0;
        }
     }
   
   g_CumulativeClosedPnL = running_pnl;
   g_PeakPnL = hist_peak; // Initialize from historical peak
   
   // Write all historical bars at once (persistent on disk)
   if(rateCount > 0)
     {
      // Using 0 as the 'from' parameter guarantees an atomic deep-wipe of all older ghost cache 
      // prior to rates[0].time. This completely resolves the MT5 bug where background Custom Symbol
      // charts bleed old historical intervals into the foreground.
      int written = CustomRatesReplace(PNL_SYMBOL, 0, 
                                       rates[rateCount-1].time + 60, rates);
                                       
      // Initialize the live bar tracker to the last historical/padded bar!
      g_CurrentBarTime = rates[rateCount-1].time;
      g_CurrentBarOpen = rates[rateCount-1].open;
      g_CurrentBarHigh = rates[rateCount-1].high;
      g_CurrentBarLow  = rates[rateCount-1].low;
      g_CurrentBarTickVol = rates[rateCount-1].tick_volume;
      g_LastFedPnL = running_pnl;
      
      // Draw trailing floor staircase
      DrawTrailingFloor(rates, rateCount);
      Print("[IR] Seeded ", rateCount, " bars (", written, " written), equity = ", 
            DoubleToString(running_pnl, 2));
     }
   else
     {
      Print("[IR] No closed deals for magic ", g_ActiveMagic, ", equity = 0.00");
     }
  }


//+------------------------------------------------------------------+
//| GUI: Dashboard Panel Overlay                                     |
//+------------------------------------------------------------------+
string LB(string n, int x, int y, string txt, int fs, color c, ENUM_ANCHOR_POINT a=ANCHOR_LEFT_UPPER)
  {
   ObjectCreate(0,n,OBJ_LABEL,0,0,0);
   ObjectSetInteger(0,n,OBJPROP_XDISTANCE,x);
   ObjectSetInteger(0,n,OBJPROP_YDISTANCE,y);
   ObjectSetString(0,n,OBJPROP_TEXT,txt);
   ObjectSetInteger(0,n,OBJPROP_COLOR,c);
   ObjectSetInteger(0,n,OBJPROP_FONTSIZE,fs);
   ObjectSetString(0,n,OBJPROP_FONT,"Trebuchet MS");
   ObjectSetInteger(0,n,OBJPROP_ANCHOR,a);
   ObjectSetInteger(0,n,OBJPROP_BACK,false);
   ObjectSetInteger(0,n,OBJPROP_SELECTABLE,false);
   return n;
  }

void PNL(string n, int x, int y, int w, int h, color bg)
  {
   ObjectCreate(0,n,OBJ_RECTANGLE_LABEL,0,0,0);
   ObjectSetInteger(0,n,OBJPROP_XDISTANCE,x);
   ObjectSetInteger(0,n,OBJPROP_YDISTANCE,y);
   ObjectSetInteger(0,n,OBJPROP_XSIZE,w);
   ObjectSetInteger(0,n,OBJPROP_YSIZE,h);
   ObjectSetInteger(0,n,OBJPROP_BGCOLOR,bg);
   ObjectSetInteger(0,n,OBJPROP_COLOR,clrNONE);
   ObjectSetInteger(0,n,OBJPROP_CORNER,CORNER_LEFT_UPPER);
   ObjectSetInteger(0,n,OBJPROP_BACK,false);
  }

void DrawChartOverlay()
  {
   if(g_ActiveChartMetric == "") { ObjectDelete(0, "IR_CHART_POPUP"); return; }
   
   string bmpName = "IR_CHART_POPUP";
   if(ObjectFind(0, bmpName) < 0)
     {
      ObjectCreate(0, bmpName, OBJ_BITMAP_LABEL, 0, 0, 0);
      ObjectSetInteger(0, bmpName, OBJPROP_BACK, false);
      ObjectSetInteger(0, bmpName, OBJPROP_ZORDER, 100);
      ObjectSetInteger(0, bmpName, OBJPROP_SELECTABLE, false);
     }
      
   ObjectSetString(0, bmpName, OBJPROP_BMPFILE, 0, g_ChartFileName);
   
   // Center on screen
   int cx = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS) / 2 - 225; // width is 450
   int cy = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS) / 2 - 140; // height is 280
   if(cy < 200) cy = 200; // prevent overlapping top dashboard
   
   ObjectSetInteger(0, bmpName, OBJPROP_XDISTANCE, cx);
   ObjectSetInteger(0, bmpName, OBJPROP_YDISTANCE, cy);
  }

void DrawDashboard()
  {
   int chartW = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
   
   // Full-width opaque background bar
   PNL("IR_BG", 0, 0, chartW, 200, C'10,10,10');
   PNL("IR_BGLINE", 0, 200, chartW, 2, C'50,50,50');
   
   // Title + Status (row 1, y=12)
   LB("IR_TITLE", 20, 12, "IRONRISK DASHBOARD  v42", 16, clrWhite);
   color sc = clrGray;
   if(g_ServerStatus=="NORMAL") sc=clrLimeGreen;
   else if(g_ServerStatus=="WARNING") sc=clrOrange;
   else if(g_ServerStatus=="CRITICAL") sc=clrCrimson;
   LB("IR_STATUS", 380, 12, g_ServerStatus, 16, sc);

   // Strategy (row 2, y=40)
   string _hdrN = g_ActiveName;
   if(StringLen(_hdrN) > 40) _hdrN = StringSubstr(_hdrN, 0, 38) + "..";
   LB("IR_BOT", 20, 42, _hdrN + "  (Magic: "+IntegerToString(g_ActiveMagic)+")", 11, clrSilver);
   
   // === Info cards (row 3, y=68) ===
   // Equity Card
   PNL("IR_PBOX", 20, 68, 230, 70, C'25,25,25');
   LB("IR_PLBL", 32, 74, "STRATEGY EQUITY", 9, clrGray);
   color pc = g_StrategyEquity>=0 ? clrLimeGreen : clrCrimson;
   LB("IR_PVAL", 32, 92, DoubleToString(g_StrategyEquity,2)+" $", 22, pc);
   LB("IR_TVAL", 32, 120, "Open: "+IntegerToString(g_LocalOpenTrades)+"  Closed: "+IntegerToString(g_RealClosedTrades)+"  Float: "+DoubleToString(g_LocalFloatingPnL,2)+" $", 9, clrSilver);
   // Trade log toggle button
   ObjectCreate(0,"IR_TLOG_BTN",OBJ_BUTTON,0,0,0);
   ObjectSetInteger(0,"IR_TLOG_BTN",OBJPROP_XDISTANCE,220);
   ObjectSetInteger(0,"IR_TLOG_BTN",OBJPROP_YDISTANCE,117);
   ObjectSetInteger(0,"IR_TLOG_BTN",OBJPROP_XSIZE,24);
   ObjectSetInteger(0,"IR_TLOG_BTN",OBJPROP_YSIZE,18);
   ObjectSetString(0,"IR_TLOG_BTN",OBJPROP_TEXT,"T");
   ObjectSetInteger(0,"IR_TLOG_BTN",OBJPROP_FONTSIZE,8);
   ObjectSetInteger(0,"IR_TLOG_BTN",OBJPROP_BGCOLOR, g_ShowTradeLog ? C'0,120,70' : C'50,50,50');
   ObjectSetInteger(0,"IR_TLOG_BTN",OBJPROP_COLOR, g_ShowTradeLog ? clrWhite : clrGray);
   ObjectSetString(0,"IR_TLOG_BTN",OBJPROP_TOOLTIP,"Show/Hide trade log");
   ObjectSetInteger(0,"IR_TLOG_BTN",OBJPROP_STATE,false);
   
    // Trailing DD Card (always visible)
    double dd_floor = g_PeakPnL - g_MaxDrawdownLimit;
    PNL("IR_DBOX", 270, 68, 230, 70, C'25,25,25');
    LB("IR_DLBL", 282, 74, "TRAILING DD", 9, clrGray);
    LB("IR_PEAK", 282, 94, "Peak:   "+DoubleToString(g_PeakPnL,2)+" $", 12, clrDodgerBlue);
    color ddc = (g_MaxDrawdownLimit>0 && g_StrategyEquity<=dd_floor) ? clrCrimson : clrOrange;
    string ddStr = g_MaxDrawdownLimit>0 ? DoubleToString(dd_floor,2)+" $" : "Sin limite";
    LB("IR_FLOOR", 282, 115, "Floor:  "+ddStr, 12, ddc);
    
    // === Dynamic Widget Layout (JSON driven) ===
    ObjectsDeleteAll(0, "IR_RV_");
     ObjectsDeleteAll(0, "IR_CHART_");
     ObjectsDeleteAll(0, "IR_EYE_");
     ObjectDelete(0, "IR_RVL");
     ObjectDelete(0, "IR_RVR");
     int rvStartX = 510;
     int cardW_r = 180; int cardGap = 8; int arrowW_r = 28;
     int availCards = ((int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS) - rvStartX - 20) / (cardW_r + cardGap);
     if(availCards < 1) availCards = 1;
     
     int enabledCount = g_Layout ? g_Layout.Count() : 0;
     bool needRiskScroll = enabledCount > availCards;
     if(g_RiskScrollOff < 0) g_RiskScrollOff = 0;
     if(needRiskScroll && g_RiskScrollOff > enabledCount - availCards)
        g_RiskScrollOff = enabledCount - availCards;
     if(!needRiskScroll) g_RiskScrollOff = 0;
     int rvX = rvStartX;
     
     // Left arrow for risk cards
     if(needRiskScroll)
       {
        ObjectCreate(0,"IR_RVL",OBJ_BUTTON,0,0,0);
        ObjectSetInteger(0,"IR_RVL",OBJPROP_XDISTANCE,rvX);
        ObjectSetInteger(0,"IR_RVL",OBJPROP_YDISTANCE,68);
        ObjectSetInteger(0,"IR_RVL",OBJPROP_XSIZE,arrowW_r);
        ObjectSetInteger(0,"IR_RVL",OBJPROP_YSIZE,70);
        ObjectSetString(0,"IR_RVL",OBJPROP_TEXT,"<");
        ObjectSetInteger(0,"IR_RVL",OBJPROP_FONTSIZE,14);
        ObjectSetInteger(0,"IR_RVL",OBJPROP_BGCOLOR, g_RiskScrollOff>0 ? C'50,50,50' : C'30,30,30');
        ObjectSetInteger(0,"IR_RVL",OBJPROP_COLOR, g_RiskScrollOff>0 ? clrWhite : clrGray);
        ObjectSetInteger(0,"IR_RVL",OBJPROP_STATE,false);
        rvX += arrowW_r + 4;
       }
       
     int visIdx = 0;
     int drawn = 0;
     for(int i=0; i<enabledCount; i++)
      {
       if(visIdx < g_RiskScrollOff) { visIdx++; continue; }
       if(drawn >= availCards) { visIdx++; continue; }
       
       CDashboardWidget *w = g_Layout.GetWidget(i);
       if(!w) continue;
       
       string pfx = "IR_RV_" + IntegerToString(i);
       
       // Match widget value_key with backend live risk_config data
       double current = 0.0;
       double lim = 0.0;
       bool hasCtx = false;
       int pctile = -1;
       string ctxTxt = "";
       color ctxCol = clrGray;
       bool isMoney = false;
       
       if(w.value_key == "current_pnl")
         {
          current = g_LocalFloatingPnL;
          lim = 0.0;
          isMoney = true;
         }
       else
         {
          for(int k=0; k<g_RiskVarCount; k++)
            {
             if(g_RiskVars[k].key == w.value_key)
               {
                current = g_RiskVars[k].current;
                lim = g_RiskVars[k].limit;
                if(g_RiskVars[k].ctx_label != "" || g_RiskVars[k].ctx_percentile >= 0) hasCtx = true;
                pctile = g_RiskVars[k].ctx_percentile;
                ctxTxt = g_RiskVars[k].ctx_label;
                ctxCol = g_RiskVars[k].ctx_color;
                if(w.value_key=="max_drawdown" || w.value_key=="daily_loss") isMoney = true;
                break;
               }
            }
         }
         
       string valStr = "";
       color valCol = clrWhite;
       int pctUsage = (lim > 0) ? (int)MathRound(current / lim * 100.0) : 0;
       string pctStr = "";
       if(w.value_key != "current_pnl" && lim > 0) pctStr = "  " + IntegerToString(pctUsage) + "%";
       string suffix = isMoney ? " $" : "";
       
       if(isMoney)
         {
          if(w.value_key == "current_pnl" || lim == 0)
             valStr = DoubleToString(current, 2) + suffix;
          else
             valStr = DoubleToString(current, 2) + " / " + DoubleToString(lim, 2) + suffix + pctStr;
          if(lim > 0 && current / lim > 0.8) valCol = clrOrangeRed;
          if(lim > 0 && current >= lim) valCol = clrCrimson;
         }
       else
         {
          int cur_int = (int)MathRound(current);
          int lim_int = (int)MathRound(lim);
          if(lim > 0) valStr = IntegerToString(cur_int) + " / " + IntegerToString(lim_int) + pctStr;
          else valStr = IntegerToString(cur_int);
         }
       
       // UI Draw Logic based on widget.style
       if(w.style == "progress_bar")
         {
          PNL(pfx+"_BG", rvX, 68, cardW_r, 70, C'34,34,34');
          PNL(pfx+"_TOP", rvX, 68, cardW_r, 3, w.accent); // The sombrero
          LB(pfx+"_LBL", rvX+8, 74, w.title, 8, C'160,160,160');
          LB(pfx+"_VAL", rvX+8, 88, valStr, 11, clrWhite);
          
          string pTxt = "Usage: " + IntegerToString(pctUsage) + "%";
          if(hasCtx && ctxTxt != "") pTxt = ctxTxt;
          LB(pfx+"_CTX", rvX+8, 108, pTxt, 8, clrLimeGreen);
          
          // Progress bar fill algorithm
          double pct = (lim > 0) ? MathMin(current / lim, 1.0) : 0.0;
          color barCol = clrLimeGreen;
          if(pct > 0.5) barCol = clrGold;
          if(pct > 0.8) barCol = clrOrangeRed;
          if(pct >= 1.0) barCol = clrCrimson;
          
          PNL(pfx+"_BAR_BG", rvX+8, 122, cardW_r-16, 6, C'51,51,51');
          int fillW = (int)(pct * (cardW_r-16));
          if(fillW > 0) PNL(pfx+"_BAR_FILL", rvX+8, 122, fillW, 6, barCol);
         }
       else
         {
          // SIMPLE TEXT STYLE
          // No context text, no limit, just pure huge value to match the Web Preview
          PNL(pfx+"_BG", rvX, 68, cardW_r, 70, C'25,25,25');
          PNL(pfx+"_TOP", rvX, 68, cardW_r, 3, w.accent);
          LB(pfx+"_LBL", rvX+10, 72, w.title, 8, clrGray);
          
          string valOnly = isMoney ? DoubleToString(current, 2) + " $" : IntegerToString((int)MathRound(current));
          LB(pfx+"_VAL", rvX+10, 95, valOnly, 15, w.accent);
         }
         
       // Chart popup toggle — available on ALL metric cards
         {
          string cName = "IR_CHART_" + IntegerToString(i);
          ObjectCreate(0, cName, OBJ_BUTTON, 0, 0, 0);
          int cBtnX = rvX + cardW_r - (w.value_key=="max_drawdown" ? 52 : 28);
          ObjectSetInteger(0, cName, OBJPROP_XDISTANCE, cBtnX);
          ObjectSetInteger(0, cName, OBJPROP_YDISTANCE, 70);
          ObjectSetInteger(0, cName, OBJPROP_XSIZE, 20);
          ObjectSetInteger(0, cName, OBJPROP_YSIZE, 20);
          ObjectSetInteger(0, cName, OBJPROP_FONTSIZE, 9);
          ObjectSetInteger(0, cName, OBJPROP_ZORDER, 10);
          bool isChActive = (g_ActiveChartMetric == w.value_key);
          ObjectSetInteger(0, cName, OBJPROP_BGCOLOR, isChActive ? clrLimeGreen : clrDodgerBlue);
          ObjectSetInteger(0, cName, OBJPROP_COLOR, clrWhite);
          ObjectSetString(0, cName, OBJPROP_TEXT, "C");
          ObjectSetString(0, cName, OBJPROP_TOOLTIP, "Show historical distribution chart");
          ObjectSetInteger(0, cName, OBJPROP_STATE, false);
         }
       
       if(w.value_key=="max_drawdown")
         {
          string eyeName = "IR_EYE_" + IntegerToString(i);
          ObjectCreate(0, eyeName, OBJ_BUTTON, 0, 0, 0);
          ObjectSetInteger(0, eyeName, OBJPROP_XDISTANCE, rvX + cardW_r - 28);
          ObjectSetInteger(0, eyeName, OBJPROP_YDISTANCE, 70);
          ObjectSetInteger(0, eyeName, OBJPROP_XSIZE, 20);
          ObjectSetInteger(0, eyeName, OBJPROP_YSIZE, 20);
          ObjectSetInteger(0, eyeName, OBJPROP_FONTSIZE, 9);
          ObjectSetInteger(0, eyeName, OBJPROP_ZORDER, 10);
          ObjectSetInteger(0, eyeName, OBJPROP_BGCOLOR, g_ShowFloorLine ? C'60,60,60' : clrOrange);
          ObjectSetInteger(0, eyeName, OBJPROP_COLOR, clrWhite);
          ObjectSetString(0, eyeName, OBJPROP_TEXT, "F"); 
          ObjectSetString(0, eyeName, OBJPROP_TOOLTIP, "Show trailing drawdown line floor on chart");
          ObjectSetInteger(0, eyeName, OBJPROP_STATE, false);
         }
         
       rvX += cardW_r + cardGap;
       visIdx++;
       drawn++;
      }
      
     // Right arrow for risk cards
     if(needRiskScroll)
       {
        ObjectCreate(0,"IR_RVR",OBJ_BUTTON,0,0,0);
        ObjectSetInteger(0,"IR_RVR",OBJPROP_XDISTANCE,rvX);
        ObjectSetInteger(0,"IR_RVR",OBJPROP_YDISTANCE,68);
        ObjectSetInteger(0,"IR_RVR",OBJPROP_XSIZE,arrowW_r);
        ObjectSetInteger(0,"IR_RVR",OBJPROP_YSIZE,70);
        ObjectSetString(0,"IR_RVR",OBJPROP_TEXT,">");
        ObjectSetInteger(0,"IR_RVR",OBJPROP_FONTSIZE,14);
        int lastRV = g_RiskScrollOff + availCards;
        ObjectSetInteger(0,"IR_RVR",OBJPROP_BGCOLOR, lastRV<enabledCount ? C'50,50,50' : C'30,30,30');
        ObjectSetInteger(0,"IR_RVR",OBJPROP_COLOR, lastRV<enabledCount ? clrWhite : clrGray);
        ObjectSetInteger(0,"IR_RVR",OBJPROP_STATE,false);
       }
    
   // === Strategy buttons (row 4, y=155) ===
   DrawButtons();
   DrawTradeLog();
   UpdateHLines();
   DrawChartOverlay();
   ChartRedraw();
  }

void DrawButtons()
  {
   ObjectsDeleteAll(0, "BTN_S_");
   ObjectDelete(0, "BTN_SL");
   ObjectDelete(0, "BTN_SR");
   int chartW = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
   int y=155, w=130, h=30, gap=6;
   int arrowW = 30;
   int searchW = 160;
   
   // === Search filter input ===
   string searchName = "IR_SEARCH";
   if(ObjectFind(0, searchName) < 0)
     {
      ObjectCreate(0, searchName, OBJ_EDIT, 0, 0, 0);
      ObjectSetInteger(0, searchName, OBJPROP_XDISTANCE, 20);
      ObjectSetInteger(0, searchName, OBJPROP_YDISTANCE, y);
      ObjectSetInteger(0, searchName, OBJPROP_XSIZE, searchW);
      ObjectSetInteger(0, searchName, OBJPROP_YSIZE, h);
      ObjectSetInteger(0, searchName, OBJPROP_FONTSIZE, 9);
      ObjectSetInteger(0, searchName, OBJPROP_COLOR, clrWhite);
      ObjectSetInteger(0, searchName, OBJPROP_BGCOLOR, C'30,30,30');
      ObjectSetInteger(0, searchName, OBJPROP_BORDER_COLOR, C'60,60,60');
      ObjectSetString(0, searchName, OBJPROP_TEXT, g_StratFilter);
      ObjectSetInteger(0, searchName, OBJPROP_ALIGN, ALIGN_LEFT);
     }
   // Placeholder hint when empty
   if(g_StratFilter == "")
      ObjectSetString(0, searchName, OBJPROP_TOOLTIP, "Type to filter...");
   
   // Build filtered list of indices
   int filtered[];
   int filteredCount = 0;
   ArrayResize(filtered, g_TotalStrategies);
   string filterLower = g_StratFilter;
   StringToLower(filterLower);
   
   for(int si=0; si<g_TotalStrategies; si++)
     {
      if(g_StratFilter == "")
        { filtered[filteredCount++] = si; continue; }
      // Match against name or magic number
      string nameLower = (si==0) ? "global / todos" : g_Strategies[si].name;
      StringToLower(nameLower);
      string magicStr = IntegerToString(g_Strategies[si].magic);
      if(StringFind(nameLower, filterLower) >= 0 || StringFind(magicStr, filterLower) >= 0)
         filtered[filteredCount++] = si;
     }
   ArrayResize(filtered, filteredCount);
   
   // Calculate visible area (after search box)
   int btnStartX = 20 + searchW + 55;  // Room for counter label
   int availW = chartW - btnStartX - 20;
   int maxVisible = availW / (w + gap);
   if(maxVisible < 1) maxVisible = 1;
   if(maxVisible >= filteredCount) maxVisible = filteredCount;
   
   // Clamp scroll offset
   if(g_StratScrollOff < 0) g_StratScrollOff = 0;
   if(filteredCount > maxVisible && g_StratScrollOff > filteredCount - maxVisible)
      g_StratScrollOff = filteredCount - maxVisible;
   if(filteredCount <= maxVisible) g_StratScrollOff = 0;
   
   bool needScroll = filteredCount > maxVisible;
   int x = btnStartX;
   
   // Left arrow
   if(needScroll)
     {
      ObjectCreate(0,"BTN_SL",OBJ_BUTTON,0,0,0);
      ObjectSetInteger(0,"BTN_SL",OBJPROP_XDISTANCE,x);
      ObjectSetInteger(0,"BTN_SL",OBJPROP_YDISTANCE,y);
      ObjectSetInteger(0,"BTN_SL",OBJPROP_XSIZE,arrowW);
      ObjectSetInteger(0,"BTN_SL",OBJPROP_YSIZE,h);
      ObjectSetString(0,"BTN_SL",OBJPROP_TEXT,"<");
      ObjectSetInteger(0,"BTN_SL",OBJPROP_FONTSIZE,12);
      ObjectSetInteger(0,"BTN_SL",OBJPROP_BGCOLOR, g_StratScrollOff>0 ? C'70,70,70' : C'35,35,35');
      ObjectSetInteger(0,"BTN_SL",OBJPROP_COLOR, g_StratScrollOff>0 ? clrWhite : clrGray);
      ObjectSetInteger(0,"BTN_SL",OBJPROP_STATE,false);
      x += arrowW + gap;
     }
   
   // Visible strategy buttons (from filtered list)
   for(int vi=0; vi<maxVisible; vi++)
     {
      int fi = g_StratScrollOff + vi;
      if(fi >= filteredCount) break;
      int i = filtered[fi]; // Original strategy index
      string n = "BTN_S_"+IntegerToString(i);
      ObjectCreate(0,n,OBJ_BUTTON,0,0,0);
      ObjectSetInteger(0,n,OBJPROP_XDISTANCE,x);
      ObjectSetInteger(0,n,OBJPROP_YDISTANCE,y);
      ObjectSetInteger(0,n,OBJPROP_XSIZE,w);
      ObjectSetInteger(0,n,OBJPROP_YSIZE,h);
      string txt = i==0 ? "Global / Todos" : g_Strategies[i].name;
      if(StringLen(txt) > 16) txt = StringSubstr(txt, 0, 14) + "..";
      ObjectSetString(0,n,OBJPROP_TOOLTIP, i==0 ? "All strategies" : IntegerToString(g_Strategies[i].magic)+"_"+g_Strategies[i].name);
      ObjectSetString(0,n,OBJPROP_TEXT,txt);
      ObjectSetInteger(0,n,OBJPROP_FONTSIZE,9);
      if(g_Strategies[i].magic==g_ActiveMagic)
        { ObjectSetInteger(0,n,OBJPROP_BGCOLOR,clrDodgerBlue); ObjectSetInteger(0,n,OBJPROP_COLOR,clrWhite); ObjectSetInteger(0,n,OBJPROP_STATE,true); }
      else
        { ObjectSetInteger(0,n,OBJPROP_BGCOLOR,C'50,50,50'); ObjectSetInteger(0,n,OBJPROP_COLOR,clrSilver); ObjectSetInteger(0,n,OBJPROP_STATE,false); }
      x += w+gap;
     }
   
   // Right arrow
   if(needScroll)
     {
      ObjectCreate(0,"BTN_SR",OBJ_BUTTON,0,0,0);
      ObjectSetInteger(0,"BTN_SR",OBJPROP_XDISTANCE,x);
      ObjectSetInteger(0,"BTN_SR",OBJPROP_YDISTANCE,y);
      ObjectSetInteger(0,"BTN_SR",OBJPROP_XSIZE,arrowW);
      ObjectSetInteger(0,"BTN_SR",OBJPROP_YSIZE,h);
      ObjectSetString(0,"BTN_SR",OBJPROP_TEXT,">");
      ObjectSetInteger(0,"BTN_SR",OBJPROP_FONTSIZE,12);
      int lastVis = g_StratScrollOff + maxVisible;
      ObjectSetInteger(0,"BTN_SR",OBJPROP_BGCOLOR, lastVis<filteredCount ? C'70,70,70' : C'35,35,35');
      ObjectSetInteger(0,"BTN_SR",OBJPROP_COLOR, lastVis<filteredCount ? clrWhite : clrGray);
      ObjectSetInteger(0,"BTN_SR",OBJPROP_STATE,false);
     }
   
   // Show count label
   string countTxt = IntegerToString(filteredCount) + "/" + IntegerToString(g_TotalStrategies);
   LB("IR_FCOUNT", 20 + searchW + gap - 4, y + 8, countTxt, 9, C'160,160,160', ANCHOR_LEFT_UPPER);
  }

void CleanTradeLog()
  {
   ObjectsDeleteAll(0, "IR_TL_");
  }

void DrawTradeLog()
  {
   CleanTradeLog();
   if(!g_ShowTradeLog) return;
   
   int chartW = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
   int chartH = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS);
   
   // Panel dimensions
   int panelX = 20;
   int panelY = 205;
   int panelW = chartW - 40;
   int panelH = chartH - panelY - 10;
   int rowH = 18;
   int maxRows = (panelH - 40) / rowH;  // Reserve 40px for header + buttons
   if(maxRows < 3) maxRows = 3;
   
   // Background panel
   PNL("IR_TL_BG", panelX, panelY, panelW, panelH, C'15,15,15');
   PNL("IR_TL_BORDER", panelX, panelY, panelW, 1, C'60,60,60');
   
   // Header
   LB("IR_TL_TITLE", panelX+10, panelY+6, "TRADE LOG  (Real closed trades)", 10, clrWhite);
   
   // Close button
   ObjectCreate(0,"IR_TL_CLOSE",OBJ_BUTTON,0,0,0);
   ObjectSetInteger(0,"IR_TL_CLOSE",OBJPROP_XDISTANCE, panelX+panelW-30);
   ObjectSetInteger(0,"IR_TL_CLOSE",OBJPROP_YDISTANCE, panelY+4);
   ObjectSetInteger(0,"IR_TL_CLOSE",OBJPROP_XSIZE,24);
   ObjectSetInteger(0,"IR_TL_CLOSE",OBJPROP_YSIZE,18);
   ObjectSetString(0,"IR_TL_CLOSE",OBJPROP_TEXT,"X");
   ObjectSetInteger(0,"IR_TL_CLOSE",OBJPROP_FONTSIZE,8);
   ObjectSetInteger(0,"IR_TL_CLOSE",OBJPROP_BGCOLOR,C'80,20,20');
   ObjectSetInteger(0,"IR_TL_CLOSE",OBJPROP_COLOR,clrWhite);
   ObjectSetInteger(0,"IR_TL_CLOSE",OBJPROP_STATE,false);
   
   // Column header row
   int hdrY = panelY + 26;
   int c1=panelX+10, c2=panelX+90, c3=panelX+190, c4=panelX+260, c5=panelX+330, c6=panelX+420;
   LB("IR_TL_H1", c1, hdrY, "DATE", 8, C'120,120,120');
   LB("IR_TL_H2", c2, hdrY, "SYMBOL", 8, C'120,120,120');
   LB("IR_TL_H3", c3, hdrY, "TYPE", 8, C'120,120,120');
   LB("IR_TL_H4", c4, hdrY, "VOLUME", 8, C'120,120,120');
   LB("IR_TL_H5", c5, hdrY, "PROFIT", 8, C'120,120,120');
   LB("IR_TL_H6", c6, hdrY, "MAGIC", 8, C'120,120,120');
   PNL("IR_TL_HLINE", panelX+5, hdrY+14, panelW-10, 1, C'40,40,40');
   
   // Collect trades into arrays (most recent first)
   if(!HistorySelect(0, TimeCurrent())) return;
   int totalDeals = HistoryDealsTotal();
   
   // Count matching deals first
   int matchCount = 0;
   for(int d=totalDeals-1; d>=0; d--)
     {
      ulong tk=HistoryDealGetTicket(d);
      if(tk<=0) continue;
      long m=HistoryDealGetInteger(tk,DEAL_MAGIC);
      if(g_ActiveMagic!=0 && m!=g_ActiveMagic) continue;
      long entry=HistoryDealGetInteger(tk,DEAL_ENTRY);
      if(entry!=DEAL_ENTRY_OUT && entry!=DEAL_ENTRY_INOUT) continue;
      matchCount++;
     }
   
   // Clamp scroll
   if(g_TradeLogScroll < 0) g_TradeLogScroll = 0;
   if(matchCount > maxRows && g_TradeLogScroll > matchCount - maxRows)
      g_TradeLogScroll = matchCount - maxRows;
   if(matchCount <= maxRows) g_TradeLogScroll = 0;
   
   // Scroll info
   LB("IR_TL_INFO", panelX+panelW-140, panelY+6, 
      IntegerToString(g_TradeLogScroll+1)+"-"+IntegerToString(MathMin(g_TradeLogScroll+maxRows,matchCount))+
      " / "+IntegerToString(matchCount), 8, clrGray);
   
   // Scroll buttons
   if(matchCount > maxRows)
     {
      ObjectCreate(0,"IR_TL_UP",OBJ_BUTTON,0,0,0);
      ObjectSetInteger(0,"IR_TL_UP",OBJPROP_XDISTANCE, panelX+panelW-60);
      ObjectSetInteger(0,"IR_TL_UP",OBJPROP_YDISTANCE, panelY+4);
      ObjectSetInteger(0,"IR_TL_UP",OBJPROP_XSIZE,24);
      ObjectSetInteger(0,"IR_TL_UP",OBJPROP_YSIZE,18);
      ObjectSetString(0,"IR_TL_UP",OBJPROP_TEXT,"^");
      ObjectSetInteger(0,"IR_TL_UP",OBJPROP_FONTSIZE,8);
      ObjectSetInteger(0,"IR_TL_UP",OBJPROP_BGCOLOR, g_TradeLogScroll>0 ? C'60,60,60' : C'30,30,30');
      ObjectSetInteger(0,"IR_TL_UP",OBJPROP_COLOR, g_TradeLogScroll>0 ? clrWhite : clrGray);
      ObjectSetInteger(0,"IR_TL_UP",OBJPROP_STATE,false);
      
      ObjectCreate(0,"IR_TL_DN",OBJ_BUTTON,0,0,0);
      ObjectSetInteger(0,"IR_TL_DN",OBJPROP_XDISTANCE, panelX+panelW-34);
      ObjectSetInteger(0,"IR_TL_DN",OBJPROP_YDISTANCE, panelY+4);
      ObjectSetInteger(0,"IR_TL_DN",OBJPROP_XSIZE,24);
      ObjectSetInteger(0,"IR_TL_DN",OBJPROP_YSIZE,18);
      ObjectSetString(0,"IR_TL_DN",OBJPROP_TEXT,"v");
      ObjectSetInteger(0,"IR_TL_DN",OBJPROP_FONTSIZE,8);
      int lastVis = g_TradeLogScroll + maxRows;
      ObjectSetInteger(0,"IR_TL_DN",OBJPROP_BGCOLOR, lastVis<matchCount ? C'60,60,60' : C'30,30,30');
      ObjectSetInteger(0,"IR_TL_DN",OBJPROP_COLOR, lastVis<matchCount ? clrWhite : clrGray);
      ObjectSetInteger(0,"IR_TL_DN",OBJPROP_STATE,false);
     }
   
   // Draw visible rows
   int rowIdx = 0;  // counts matching deals
   int drawn = 0;
   int startY = hdrY + 18;
   
   for(int d=totalDeals-1; d>=0 && drawn<maxRows; d--)
     {
      ulong tk=HistoryDealGetTicket(d);
      if(tk<=0) continue;
      long m=HistoryDealGetInteger(tk,DEAL_MAGIC);
      if(g_ActiveMagic!=0 && m!=g_ActiveMagic) continue;
      long entry=HistoryDealGetInteger(tk,DEAL_ENTRY);
      if(entry!=DEAL_ENTRY_OUT && entry!=DEAL_ENTRY_INOUT) continue;
      
      if(rowIdx < g_TradeLogScroll) { rowIdx++; continue; }
      
      int ry = startY + drawn * rowH;
      string ri = IntegerToString(drawn);
      
      // Alternate row bg
      if(drawn%2==0) PNL("IR_TL_RB_"+ri, panelX+5, ry-1, panelW-10, rowH, C'20,20,20');
      
      // Date
      datetime dt = (datetime)HistoryDealGetInteger(tk, DEAL_TIME);
      string dateStr = TimeToString(dt, TIME_DATE|TIME_MINUTES);
      LB("IR_TL_D_"+ri, c1, ry, dateStr, 8, clrSilver);
      
      // Symbol
      string sym = HistoryDealGetString(tk, DEAL_SYMBOL);
      LB("IR_TL_S_"+ri, c2, ry, sym, 8, clrSilver);
      
      // Type
      long dealType = HistoryDealGetInteger(tk, DEAL_TYPE);
      string typeStr = dealType==DEAL_TYPE_BUY ? "BUY" : (dealType==DEAL_TYPE_SELL ? "SELL" : "?");
      color typeClr = dealType==DEAL_TYPE_BUY ? clrDodgerBlue : clrOrange;
      LB("IR_TL_T_"+ri, c3, ry, typeStr, 8, typeClr);
      
      // Volume
      double vol = HistoryDealGetDouble(tk, DEAL_VOLUME);
      LB("IR_TL_V_"+ri, c4, ry, DoubleToString(vol, 2), 8, clrSilver);
      
      // Profit
      double pnl = HistoryDealGetDouble(tk, DEAL_PROFIT) + HistoryDealGetDouble(tk, DEAL_SWAP) + HistoryDealGetDouble(tk, DEAL_COMMISSION);
      color pnlClr = pnl >= 0 ? clrLimeGreen : clrCrimson;
      LB("IR_TL_P_"+ri, c5, ry, DoubleToString(pnl, 2)+" $", 8, pnlClr);
      
      // Magic
      LB("IR_TL_M_"+ri, c6, ry, IntegerToString(m), 8, C'100,100,100');
      
      drawn++;
      rowIdx++;
     }
  }

void UpdateHLines()
  {
   if(g_StrategyEquity > g_PeakPnL) g_PeakPnL = g_StrategyEquity;
   
   // Zero line
   if(ObjectFind(0,"IR_ZERO")<0)
     { ObjectCreate(0,"IR_ZERO",OBJ_HLINE,0,0,0.0); ObjectSetInteger(0,"IR_ZERO",OBJPROP_COLOR,clrWhite); ObjectSetInteger(0,"IR_ZERO",OBJPROP_STYLE,STYLE_DOT); ObjectSetInteger(0,"IR_ZERO",OBJPROP_WIDTH,1); ObjectSetInteger(0,"IR_ZERO",OBJPROP_BACK,true); }
   
   if(g_MaxDrawdownLimit > 0)
     {
       // IR_DDFLOOR managed inside DrawTrailingFloor
      // Peak line (blue)  
      if(ObjectFind(0,"IR_PEAKL")<0)
        { ObjectCreate(0,"IR_PEAKL",OBJ_HLINE,0,0,g_PeakPnL); ObjectSetInteger(0,"IR_PEAKL",OBJPROP_COLOR,clrDodgerBlue); ObjectSetInteger(0,"IR_PEAKL",OBJPROP_STYLE,STYLE_DOT); ObjectSetInteger(0,"IR_PEAKL",OBJPROP_WIDTH,1); ObjectSetInteger(0,"IR_PEAKL",OBJPROP_BACK,true); }
      else
        ObjectSetDouble(0,"IR_PEAKL",OBJPROP_PRICE,g_PeakPnL);
     }
  }


//+------------------------------------------------------------------+
//| Bootstrap Mode GUI (shown when NOT on IronRisk_PnL)             |
//+------------------------------------------------------------------+
void DrawBootstrapScreen()
  {
   ChartSetInteger(0, CHART_MODE, CHART_LINE);
   ChartSetInteger(0, CHART_COLOR_CHART_LINE, clrNONE);
   ChartSetInteger(0, CHART_SHOW_OHLC, false);
   ChartSetInteger(0, CHART_SHOW_GRID, false);
   ChartSetInteger(0, CHART_SHOW_PRICE_SCALE, false);
   ChartSetInteger(0, CHART_SHOW_VOLUMES, CHART_VOLUME_HIDE);
   ChartSetInteger(0, CHART_SHOW_DATE_SCALE, false);
   ChartSetInteger(0, CHART_COLOR_BACKGROUND, clrBlack);
   ChartSetInteger(0, CHART_COLOR_FOREGROUND, clrDarkGray);
   
   PNL("IR_BOOT_BG", 50, 80, 700, 200, C'15,15,15');
   LB("IR_BOOT_T1", 80, 100, "IRONRISK DASHBOARD v27", 20, clrWhite);
   LB("IR_BOOT_T2", 80, 140, "Simbolo personalizado IronRisk_PnL creado correctamente.", 12, clrLimeGreen);
   LB("IR_BOOT_T3", 80, 170, "Se ha abierto un grafico de IronRisk_PnL automaticamente.", 11, clrSilver);
   LB("IR_BOOT_T4", 80, 195, ">>> Arrastra este EA a la pestana 'IronRisk_PnL' <<<", 13, clrGold);
   LB("IR_BOOT_T5", 80, 225, "Puedes cerrar esta pestana despues.", 10, clrGray);
   ChartRedraw();
  }


//+------------------------------------------------------------------+
//| Data Calculators                                                 |
//+------------------------------------------------------------------+
void CalculateLocalStats()
  {
   g_LocalFloatingPnL = 0.0;
   g_LocalOpenTrades = 0;
   for(int p=PositionsTotal()-1; p>=0; p--)
     {
      ulong tk=PositionGetTicket(p);
      if(PositionSelectByTicket(tk))
        {
         long mag=PositionGetInteger(POSITION_MAGIC);
         if(g_ActiveMagic==0 || g_ActiveMagic==mag)
           { g_LocalOpenTrades++; g_LocalFloatingPnL += PositionGetDouble(POSITION_PROFIT)+PositionGetDouble(POSITION_SWAP); }
        }
     }
   
   // Strategy Equity = cumulative closed P&L + current floating
   g_StrategyEquity = g_CumulativeClosedPnL + g_LocalFloatingPnL;
   g_LocalDrawdown = (g_PeakPnL > g_StrategyEquity) ? (g_PeakPnL - g_StrategyEquity) : 0.0;
   if(g_StrategyEquity > g_PeakPnL) g_PeakPnL = g_StrategyEquity;
   
   // Recalculate cumulative closed PnL (in case new deals closed since last check)
   double newClosed = 0.0;
   int closedCount = 0;
   if(HistorySelect(0, TimeCurrent()))
     {
      for(int d=0; d<HistoryDealsTotal(); d++)
        {
         ulong tk=HistoryDealGetTicket(d);
         if(tk<=0) continue;
         long m=HistoryDealGetInteger(tk,DEAL_MAGIC);
         if(g_ActiveMagic!=0 && m!=g_ActiveMagic) continue;
         long entry=HistoryDealGetInteger(tk,DEAL_ENTRY);
         if(entry!=DEAL_ENTRY_OUT && entry!=DEAL_ENTRY_INOUT) continue;
         newClosed += HistoryDealGetDouble(tk,DEAL_PROFIT)+HistoryDealGetDouble(tk,DEAL_SWAP)+HistoryDealGetDouble(tk,DEAL_COMMISSION);
         closedCount++;
        }
     }
   g_CumulativeClosedPnL = newClosed;
   g_RealClosedTrades = closedCount;
   g_StrategyEquity = g_CumulativeClosedPnL + g_LocalFloatingPnL;
   g_StrategyEquity = g_CumulativeClosedPnL + g_LocalFloatingPnL;
}

void RefreshStrategies()
  {
   if(!AppServer) return;
   string resp = AppServer.FetchStrategies();
   if(resp != "")
     {
      string st[]; int cnt=StringSplit(resp,';',st);
      SStrategyNode ns[]; ArrayResize(ns,cnt+1);
      ns[0].magic=0; ns[0].name="Manual / Todo"; int nt=1;
      for(int i=0;i<cnt;i++) { if(st[i]=="") continue; string p[]; if(StringSplit(st[i],'|',p)==2) { ns[nt].magic=StringToInteger(p[0]); ns[nt].name=p[1]; nt++; } }
      if(nt != g_TotalStrategies)
        { ArrayResize(g_Strategies,nt); g_TotalStrategies=nt; for(int i=0;i<nt;i++){g_Strategies[i].magic=ns[i].magic; g_Strategies[i].name=ns[i].name;} if(g_IsDashboardMode) DrawDashboard(); }
     }
   else if(g_TotalStrategies==0)
     { ArrayResize(g_Strategies,1); g_Strategies[0].magic=0; g_Strategies[0].name="Manual (Offline)"; g_TotalStrategies=1; if(g_IsDashboardMode) DrawDashboard(); }
  }

void RefreshLayout()
  {
   if(!AppServer || !g_Layout) return;
   string json = AppServer.FetchLayoutConfig(g_ActiveMagic);
   if(json != "")
     {
      g_Layout.ParseJSON(json);
      if(g_IsDashboardMode) DrawDashboard();
     }
  }

//+------------------------------------------------------------------+
//| Init / Event Loop                                                |
//+------------------------------------------------------------------+
int OnInit()
  {
   if(!TerminalInfoInteger(TERMINAL_DLLS_ALLOWED) && !MQLInfoInteger(MQL_DLLS_ALLOWED))
     { MessageBox("Debe permitir importacion de DLLs.", "IronRisk", MB_ICONWARNING|MB_OK); return(INIT_FAILED); }

   AppServer = new CServerClient(InpWebhookHost, InpWebhookPort, InpWebhookPath, InpUseHTTPS, InpApiToken);
   g_Layout = new CDashboardLayout();
    InitDefaultRiskVars();
   g_TotalStrategies = 0;
   RefreshStrategies();
   if(g_TotalStrategies>0) { g_ActiveMagic=g_Strategies[0].magic; g_ActiveName=g_Strategies[0].name; }
   RefreshLayout();
   
   // Detect mode
   g_IsDashboardMode = (Symbol() == PNL_SYMBOL);
   
   if(g_IsDashboardMode)
     {
      // === DASHBOARD MODE: We ARE on the Custom Symbol ===
      Print("[IR] Dashboard mode ON IronRisk_PnL (v27 - scroll + dynamic risk + progress bars)");
      // Style: dark background, grid
      ChartSetInteger(0, CHART_COLOR_BACKGROUND, C'10,10,10');
      ChartSetInteger(0, CHART_COLOR_FOREGROUND, clrSilver);
      ChartSetInteger(0, CHART_COLOR_GRID, C'25,25,25');
      ChartSetInteger(0, CHART_SHOW_GRID, true);
      ChartSetInteger(0, CHART_SHOW_PRICE_SCALE, true);
      ChartSetInteger(0, CHART_SHOW_DATE_SCALE, true);
      ChartSetInteger(0, CHART_SHOW_VOLUMES, CHART_VOLUME_HIDE);
      
      // We no longer force CHART_LINE or CHART_SHOW_OHLC so the user can choose candles/bars
      ChartSetInteger(0, CHART_AUTOSCROLL, true);
      ChartSetInteger(0, CHART_SHIFT, true);
      
      // Seed full equity curve from deal history (persistent M1 bars)
      g_LastFedPnL = EMPTY_VALUE;
      CalculateLocalStats();
      SeedHistoricalEquity();
      FeedPnLUpdate(g_StrategyEquity);
      DrawDashboard();
     }
   else
     {
      // === BOOTSTRAP MODE: Create symbol, open chart, show instructions ===
      Print("[IR] Bootstrap mode - creating ", PNL_SYMBOL);
      if(!EnsurePnLSymbol())
        { Print("[IR] Failed to create symbol"); return(INIT_FAILED); }
      
      // Open the PnL chart automatically (user picks timeframe)
      long cid = ChartOpen(PNL_SYMBOL, PERIOD_M1);
      if(cid > 0)
        {
         ChartSetInteger(cid, CHART_MODE, CHART_LINE);
         ChartSetInteger(cid, CHART_COLOR_CHART_LINE, clrLimeGreen);
         ChartSetInteger(cid, CHART_COLOR_BACKGROUND, C'10,10,10');
         ChartSetInteger(cid, CHART_COLOR_FOREGROUND, clrSilver);
         ChartSetInteger(cid, CHART_COLOR_GRID, C'25,25,25');
         ChartSetInteger(cid, CHART_SHOW_GRID, true);
         ChartSetInteger(cid, CHART_AUTOSCROLL, true);
         ChartRedraw(cid);
        }
      
      DrawBootstrapScreen();
     }
   
   EventSetTimer(InpTimerSec > 0 ? InpTimerSec : 1);
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   ObjectsDeleteAll(0, "IR_");
    ObjectsDeleteAll(0, "IR_FS_");
   ObjectsDeleteAll(0, "BTN_S_");
   if(CheckPointer(AppServer)==POINTER_DYNAMIC) delete AppServer;
   if(CheckPointer(g_Layout)==POINTER_DYNAMIC) delete g_Layout;
  }

void OnTick()
  {
   if(!g_IsDashboardMode) return;
   CalculateLocalStats();
    // FeedPnLUpdate removed from OnTick to prevent tick feedback loop
   DrawDashboard();
  }

void OnTimer()
  {
   // In BOOTSTRAP mode: do NOT feed ticks, only send heartbeat
   if(!g_IsDashboardMode)
     {
      if(CheckPointer(AppServer)==POINTER_DYNAMIC)
        {
         CalculateLocalStats();
         AppServer.SyncClosedDeals(g_ActiveMagic);
         AppServer.SendHeartbeat(g_ActiveMagic, g_StrategyEquity, g_LocalDrawdown, g_LocalOpenTrades);
        }
      return;
     }
     
   CalculateLocalStats();
   FeedPnLUpdate(g_StrategyEquity);
   DrawDashboard();
   
   if(CheckPointer(AppServer)==POINTER_DYNAMIC)
     {
      AppServer.SyncClosedDeals(g_ActiveMagic);
      AppServer.SendHeartbeat(g_ActiveMagic, g_StrategyEquity, g_LocalDrawdown, g_LocalOpenTrades);
     }
   
   static int tc=0; tc+=InpTimerSec;
   if(tc>=30) { tc=0; RefreshStrategies(); }
   
   static int tcLayout=0; tcLayout+=InpTimerSec;
   if(tcLayout>=3) { tcLayout=0; RefreshLayout(); }
  }

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
  {
   if(!g_IsDashboardMode) return;
   // Search filter handler
   if(id==CHARTEVENT_OBJECT_ENDEDIT && sparam=="IR_SEARCH")
     {
      g_StratFilter = ObjectGetString(0, "IR_SEARCH", OBJPROP_TEXT);
      g_StratScrollOff = 0; // Reset scroll on new filter
      DrawDashboard();
      return;
     }
   // Scroll arrow handlers
   if(id==CHARTEVENT_OBJECT_CLICK)
     {
      // Trade log handlers
      if(sparam=="IR_TLOG_BTN") { g_ShowTradeLog=!g_ShowTradeLog; g_TradeLogScroll=0; if(!g_ShowTradeLog) CleanTradeLog(); ObjectSetInteger(0,sparam,OBJPROP_STATE,false); DrawDashboard(); return; }
      if(sparam=="IR_TL_CLOSE") { g_ShowTradeLog=false; CleanTradeLog(); ObjectSetInteger(0,sparam,OBJPROP_STATE,false); DrawDashboard(); return; }
      if(sparam=="IR_TL_UP")    { g_TradeLogScroll--; ObjectSetInteger(0,sparam,OBJPROP_STATE,false); DrawDashboard(); return; }
      if(sparam=="IR_TL_DN")    { g_TradeLogScroll++; ObjectSetInteger(0,sparam,OBJPROP_STATE,false); DrawDashboard(); return; }
      if(sparam=="BTN_SL") { g_StratScrollOff--; ObjectSetInteger(0,sparam,OBJPROP_STATE,false); DrawDashboard(); return; }
      if(sparam=="BTN_SR") { g_StratScrollOff++; ObjectSetInteger(0,sparam,OBJPROP_STATE,false); DrawDashboard(); return; }
      if(sparam=="IR_RVL") { g_RiskScrollOff--;  ObjectSetInteger(0,sparam,OBJPROP_STATE,false); DrawDashboard(); return; }
      if(sparam=="IR_RVR") { g_RiskScrollOff++;  ObjectSetInteger(0,sparam,OBJPROP_STATE,false); DrawDashboard(); return; }
      
      // Histogram/Chart Button Handle
      if(StringFind(sparam, "IR_CHART_") == 0 && sparam != "IR_CHART_POPUP")
        {
         int idx = (int)StringToInteger(StringSubstr(sparam, 9));
         if(g_Layout && idx >= 0 && idx < g_Layout.Count())
           {
            CDashboardWidget *w = g_Layout.GetWidget(idx);
            if(w)
              {
               if(g_ActiveChartMetric == w.value_key)
                 {
                  // Toggle off
                  g_ActiveChartMetric = "";
                  g_ChartMetricCardId = -1;
                  g_ChartFileName = "";
                 }
               else
                 {
                  // Toggle on
                  g_ActiveChartMetric = w.value_key;
                  g_ChartMetricCardId = idx;
                  
                  // Look up current value from RiskVars
                  double val = 0.0;
                  for(int k=0; k<g_RiskVarCount; k++) { if(g_RiskVars[k].key == w.value_key) { val = g_RiskVars[k].current; break; } }
                  
                  // Download fresh chart from backend
                  if(AppServer != NULL)
                    {
                     string fName = AppServer.DownloadRiskChart(g_ActiveMagic, g_ActiveChartMetric, val);
                     if(fName != "") g_ChartFileName = fName;
                    }
                 }
              }
            ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
            DrawDashboard();
            return;
           }
        }
        
      // Dismiss popup if clicking on it
      if(sparam == "IR_CHART_POPUP")
        {
         g_ActiveChartMetric = "";
         g_ChartMetricCardId = -1;
         g_ChartFileName = "";
         DrawDashboard();
         return;
        }
     }
   if(id==CHARTEVENT_OBJECT_CLICK && StringFind(sparam,"IR_EYE_")==0)
     {
      g_ShowFloorLine = !g_ShowFloorLine;
      int vis = g_ShowFloorLine ? OBJ_ALL_PERIODS : OBJ_NO_PERIODS;
      if(ObjectFind(0,"IR_DDFLOOR") >= 0)
         ObjectSetInteger(0,"IR_DDFLOOR",OBJPROP_TIMEFRAMES,vis);
      if(ObjectFind(0,"IR_PEAKL") >= 0)
         ObjectSetInteger(0,"IR_PEAKL",OBJPROP_TIMEFRAMES,vis);
      for(int s=0; s<g_FloorSegCount; s++)
        {
         string sn = "IR_FS_" + IntegerToString(s);
         if(ObjectFind(0, sn) >= 0) ObjectSetInteger(0, sn, OBJPROP_TIMEFRAMES, vis);
        }
      ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
      DrawDashboard();
     }
   if(id==CHARTEVENT_OBJECT_CLICK && StringFind(sparam,"BTN_S_")==0)
     {
      int ci=(int)StringToInteger(StringSubstr(sparam,6));
      if(ci>=0 && ci<g_TotalStrategies)
        {
         g_ActiveMagic=g_Strategies[ci].magic;
         g_ActiveName=g_Strategies[ci].name;
         g_PeakPnL=0.0;
         g_CumulativeClosedPnL=0.0;
         // Reset live bar tracking
         g_CurrentBarTime = 0;
         g_CurrentBarOpen = 0.0;
         g_CurrentBarHigh = 0.0;
         g_CurrentBarLow  = 0.0;
         g_CurrentBarTickVol = 0;
         ClearFloorSegments();
         g_ShowTradeLog=false; g_TradeLogScroll=0; CleanTradeLog();
         ObjectsDeleteAll(0, "IR_EYE_");
         g_LastFedPnL = EMPTY_VALUE;
         g_ActiveChartMetric = "";
         g_ChartMetricCardId = -1;
         g_ChartFileName = "";
         
         // 1. Wipe current chart completely to avoid ghost lines from previous strategy
         ClearSymbolHistory();
         // 2. Fetch fresh config immediately so risk cards update instantly
         if(CheckPointer(AppServer)==POINTER_DYNAMIC)
            AppServer.SendHeartbeat(g_ActiveMagic, 0.0, 0.0, 0);
            
         CalculateLocalStats();
         SeedHistoricalEquity();
         FeedPnLUpdate(g_StrategyEquity);
         
         RefreshLayout();
         DrawDashboard();
            }
        }
     }
  
