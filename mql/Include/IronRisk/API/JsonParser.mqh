//+------------------------------------------------------------------+
//| JsonParser.mqh — Minimal JSON parser for IronRisk responses      |
//+------------------------------------------------------------------+
#ifndef IRONRISK_JSON_PARSER_MQH
#define IRONRISK_JSON_PARSER_MQH

//--- Simple JSON value extractor (no external dependencies)
class CJsonParser
{
public:
   //--- Extract a string value by key
   static string GetString(const string &json, const string &key)
   {
      string searchKey = "\"" + key + "\"";
      int pos = StringFind(json, searchKey);
      if(pos < 0) return "";
      
      // Find the colon after the key
      int colonPos = StringFind(json, ":", pos + StringLen(searchKey));
      if(colonPos < 0) return "";
      
      // Find opening quote
      int startQuote = StringFind(json, "\"", colonPos + 1);
      if(startQuote < 0) return "";
      
      // Find closing quote
      int endQuote = StringFind(json, "\"", startQuote + 1);
      if(endQuote < 0) return "";
      
      return StringSubstr(json, startQuote + 1, endQuote - startQuote - 1);
   }
   
   //--- Extract a numeric value by key
   static double GetDouble(const string &json, const string &key)
   {
      string searchKey = "\"" + key + "\"";
      int pos = StringFind(json, searchKey);
      if(pos < 0) return 0.0;
      
      int colonPos = StringFind(json, ":", pos + StringLen(searchKey));
      if(colonPos < 0) return 0.0;
      
      // Extract number chars after colon
      string numStr = "";
      int i = colonPos + 1;
      int len = StringLen(json);
      
      // Skip whitespace
      while(i < len)
      {
         ushort ch = StringGetCharacter(json, i);
         if(ch != ' ' && ch != '\t' && ch != '\n' && ch != '\r') break;
         i++;
      }
      
      // Read number
      while(i < len)
      {
         ushort ch = StringGetCharacter(json, i);
         if((ch >= '0' && ch <= '9') || ch == '.' || ch == '-' || ch == '+' || ch == 'e' || ch == 'E')
         {
            numStr += CharToString((uchar)ch);
            i++;
         }
         else break;
      }
      
      return StringToDouble(numStr);
   }
   
   //--- Extract an integer value by key
   static int GetInt(const string &json, const string &key)
   {
      return (int)GetDouble(json, key);
   }
   
   //--- Check if a key exists in JSON
   static bool HasKey(const string &json, const string &key)
   {
      return StringFind(json, "\"" + key + "\"") >= 0;
   }
};

#endif
