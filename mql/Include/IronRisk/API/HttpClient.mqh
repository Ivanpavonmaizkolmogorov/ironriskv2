//+------------------------------------------------------------------+
//| HttpClient.mqh — WebRequest wrapper for IronRisk API             |
//| Part of the IronRisk V2 ecosystem                                |
//+------------------------------------------------------------------+
#ifndef IRONRISK_HTTP_CLIENT_MQH
#define IRONRISK_HTTP_CLIENT_MQH

#include "JsonParser.mqh"

class CHttpClient
{
private:
   string m_baseUrl;
   string m_apiToken;
   int    m_timeout;

public:
   CHttpClient() : m_baseUrl(""), m_apiToken(""), m_timeout(5000) {}
   
   void SetBaseUrl(string url)    { m_baseUrl = url; }
   void SetApiToken(string token) { m_apiToken = token; }
   void SetTimeout(int ms)        { m_timeout = ms; }
   
   //--- Send heartbeat to backend
   bool SendHeartbeat(double currentPnl, double currentDD, int openTrades,
                      int consecLosses, int stagDays, int stagTrades,
                      int magicNumber, string &response)
   {
      string url = m_baseUrl + "/api/live/heartbeat";
      
      // Build JSON payload
      string payload = "{";
      payload += "\"api_token\":\"" + m_apiToken + "\",";
      payload += "\"magic_number\":" + IntegerToString(magicNumber) + ",";
      payload += "\"current_pnl\":" + DoubleToString(currentPnl, 2) + ",";
      payload += "\"current_drawdown\":" + DoubleToString(currentDD, 2) + ",";
      payload += "\"open_trades\":" + IntegerToString(openTrades) + ",";
      payload += "\"consecutive_losses\":" + IntegerToString(consecLosses) + ",";
      payload += "\"stagnation_days\":" + IntegerToString(stagDays) + ",";
      payload += "\"stagnation_trades\":" + IntegerToString(stagTrades);
      payload += "}";
      
      return PostRequest(url, payload, response);
   }
   
   //--- Get simple status check
   bool GetStatus(int magicNumber, string &response)
   {
      string url = m_baseUrl + "/api/live/status/" + m_apiToken + "/" + IntegerToString(magicNumber);
      return GetRequest(url, response);
   }

private:
   bool PostRequest(string url, string payload, string &response)
   {
      char   postData[];
      char   result[];
      string headers = "Content-Type: application/json\r\n";
      string resultHeaders;
      
      StringToCharArray(payload, postData, 0, WHOLE_ARRAY, CP_UTF8);
      // Remove null terminator
      ArrayResize(postData, ArraySize(postData) - 1);
      
      int res = WebRequest("POST", url, headers, m_timeout, postData, result, resultHeaders);
      
      if(res == -1)
      {
         int error = GetLastError();
         PrintFormat("[IronRisk] WebRequest POST failed. Error: %d. URL: %s", error, url);
         PrintFormat("[IronRisk] Make sure URL is added to Tools > Options > Expert Advisors > Allow WebRequest");
         return false;
      }
      
      response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      
      if(res != 200)
      {
         PrintFormat("[IronRisk] API returned HTTP %d: %s", res, response);
         return false;
      }
      
      return true;
   }
   
   bool GetRequest(string url, string &response)
   {
      char   postData[];
      char   result[];
      string headers = "";
      string resultHeaders;
      
      int res = WebRequest("GET", url, headers, m_timeout, postData, result, resultHeaders);
      
      if(res == -1)
      {
         int error = GetLastError();
         PrintFormat("[IronRisk] WebRequest GET failed. Error: %d. URL: %s", error, url);
         return false;
      }
      
      response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      
      if(res != 200)
      {
         PrintFormat("[IronRisk] API returned HTTP %d: %s", res, response);
         return false;
      }
      
      return true;
   }
};

#endif
