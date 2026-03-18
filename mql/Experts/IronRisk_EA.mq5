//+------------------------------------------------------------------+
//| IronRisk_EA.mq5 — Real-Time Risk Shield for MetaTrader           |
//| Part of the IronRisk V2 ecosystem                                |
//|                                                                  |
//| FUNCTION: "Dumb messenger" — extracts live PnL, sends to backend,|
//| receives risk zone, draws visual shield. Does NOT execute trades. |
//+------------------------------------------------------------------+
#property copyright   "IronRisk V2"
#property description "Visual Firewall — Probabilistic Blindness Shield"
#property version     "2.00"
#property indicator_separate_window
#property indicator_buffers 0

#include <IronRisk/API/HttpClient.mqh>
#include <IronRisk/API/JsonParser.mqh>
#include <IronRisk/GUI/GUI_Manager.mqh>
#include <IronRisk/Visuals/Thermometer.mqh>
#include <IronRisk/Visuals/Radar.mqh>

//--- Input parameters (user pastes their API token here)
input string   InpApiToken       = "";                           // API Token (from WebApp)
input string   InpServerUrl      = "http://localhost:8000";      // Backend URL
input int      InpMagicNumber    = 0;                            // Magic Number (0 = all)
input int      InpUpdateSeconds  = 5;                            // Update interval (seconds)
input bool     InpUseRadarMode   = false;                        // Use Radar (advanced) mode

//--- Global objects
CHttpClient    g_httpClient;
CGUI_Manager   g_guiManager;
CThermometer   g_thermometer;
CRadar         g_radar;

//--- State
datetime       g_lastUpdate = 0;
int            g_subwindow  = 0;
bool           g_isConnected = false;

//+------------------------------------------------------------------+
//| Expert initialization                                            |
//+------------------------------------------------------------------+
int OnInit()
{
   if(StringLen(InpApiToken) == 0)
   {
      Print("[IronRisk] ERROR: No API Token provided. Get one from the WebApp.");
      return INIT_PARAMETERS_INCORRECT;
   }
   
   // Configure HTTP client
   g_httpClient.SetBaseUrl(InpServerUrl);
   g_httpClient.SetApiToken(InpApiToken);
   g_httpClient.SetTimeout(5000);
   
   // Find our subwindow
   g_subwindow = ChartWindowFind(0, "IronRisk_EA");
   if(g_subwindow < 0) g_subwindow = 0;
   
   // Initialize visuals
   if(InpUseRadarMode)
      g_radar.Init(g_subwindow);
   else
      g_thermometer.Init(g_subwindow);
   
   // Initialize GUI with single strategy for now
   string names[]  = {"Strategy"};
   int    magics[] = {InpMagicNumber};
   g_guiManager.Init(magics, names, 1);
   
   // Initial status check
   string response;
   if(g_httpClient.GetStatus(InpMagicNumber, response))
   {
      g_isConnected = true;
      string status = CJsonParser::GetString(response, "status");
      string stratName = CJsonParser::GetString(response, "strategy");
      PrintFormat("[IronRisk] Connected! Strategy: %s | Status: %s", stratName, status);
   }
   else
   {
      Print("[IronRisk] Could not reach backend. Will retry on next tick.");
   }
   
   // Set timer
   EventSetTimer(InpUpdateSeconds);
   
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                           |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   g_guiManager.Deinit();
   g_thermometer.Destroy();
   g_radar.Destroy();
}

//+------------------------------------------------------------------+
//| Timer event — periodic heartbeat                                 |
//+------------------------------------------------------------------+
void OnTimer()
{
   SendHeartbeat();
}

//+------------------------------------------------------------------+
//| Chart events — GUI button clicks                                 |
//+------------------------------------------------------------------+
void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
{
   int clicked = g_guiManager.OnEvent(id, lparam, dparam, sparam);
   if(clicked >= 0)
   {
      // Immediately refresh with new selection
      SendHeartbeat();
   }
}

//+------------------------------------------------------------------+
//| Core: extract PnL, send heartbeat, update visuals                |
//+------------------------------------------------------------------+
void SendHeartbeat()
{
   // 1. Extract live PnL data
   double totalPnl = 0;
   double maxEquity = 0;
   double currentDD = 0;
   int    openTrades = 0;
   int    selectedMagic = g_guiManager.GetSelectedMagic();
   
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      
      // Filter by magic number (0 = all)
      if(selectedMagic > 0)
      {
         long posMagic = PositionGetInteger(POSITION_MAGIC);
         if(posMagic != selectedMagic) continue;
      }
      
      double posProfit = PositionGetDouble(POSITION_PROFIT)
                       + PositionGetDouble(POSITION_SWAP);
      totalPnl += posProfit;
      openTrades++;
   }
   
   // Simple drawdown approximation from session
   currentDD = MathAbs(MathMin(totalPnl, 0));
   
   // 2. Send to backend
   string response;
   bool ok = g_httpClient.SendHeartbeat(
      totalPnl, currentDD, openTrades,
      0,  // consecutive_losses — tracked server-side in future
      0,  // stagnation_days
      0,  // stagnation_trades
      selectedMagic, response
   );
   
   if(!ok)
   {
      g_isConnected = false;
      return;
   }
   
   g_isConnected = true;
   
   // 3. Parse response
   string status = CJsonParser::GetString(response, "status");
   double floor  = CJsonParser::GetDouble(response, "floor_level");
   double ceil   = CJsonParser::GetDouble(response, "ceiling_level");
   
   // Get drawdown metric details (first metric in array)
   // For simplicity, extract from the flat response
   double ddValue = currentDD;
   double ddPct   = 0;
   double ddWarn  = MathAbs(ceil);
   double ddCrit  = MathAbs(floor);
   
   // 4. Update visuals
   if(InpUseRadarMode)
   {
      g_radar.Update(totalPnl, floor, ceil, status);
   }
   else
   {
      g_thermometer.Update(status, ddValue, ddWarn, ddCrit, ddPct);
   }
   
   g_lastUpdate = TimeCurrent();
}

//+------------------------------------------------------------------+
//| Tick event — not used for heartbeat (timer handles it)           |
//+------------------------------------------------------------------+
void OnTick()
{
   // Intentionally empty — timer handles updates
   // This avoids excessive API calls on busy symbols
}
//+------------------------------------------------------------------+
