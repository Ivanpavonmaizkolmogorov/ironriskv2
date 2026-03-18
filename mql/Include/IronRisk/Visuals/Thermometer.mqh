//+------------------------------------------------------------------+
//| Thermometer.mqh — Basic mode: variance zone labels in subwindow  |
//+------------------------------------------------------------------+
#ifndef IRONRISK_THERMOMETER_MQH
#define IRONRISK_THERMOMETER_MQH

#define THERM_PREFIX "IRK_THERM_"

class CThermometer
{
private:
   int    m_subwindow;
   string m_currentZone;
   double m_currentValue;
   double m_warningThreshold;
   double m_criticalThreshold;

public:
   CThermometer() : m_subwindow(0), m_currentZone("NORMAL"),
                    m_currentValue(0), m_warningThreshold(0), m_criticalThreshold(0) {}
   
   void Init(int subwindow)
   {
      m_subwindow = subwindow;
      CreateLabels();
   }
   
   void Update(string zone, double value, double warningThr, double criticalThr, double percentile)
   {
      m_currentZone = zone;
      m_currentValue = value;
      m_warningThreshold = warningThr;
      m_criticalThreshold = criticalThr;
      
      // Zone indicator
      color zoneColor = clrLimeGreen;
      string zoneText = "● NORMAL";
      
      if(zone == "WARNING")
      {
         zoneColor = clrYellow;
         zoneText = "▲ WARNING";
      }
      else if(zone == "CRITICAL")
      {
         zoneColor = clrRed;
         zoneText = "■ CRITICAL";
      }
      
      // Update labels
      ObjectSetString(0, THERM_PREFIX + "zone", OBJPROP_TEXT, zoneText);
      ObjectSetInteger(0, THERM_PREFIX + "zone", OBJPROP_COLOR, zoneColor);
      
      ObjectSetString(0, THERM_PREFIX + "value", OBJPROP_TEXT, 
         "DD: $" + DoubleToString(value, 2));
      ObjectSetInteger(0, THERM_PREFIX + "value", OBJPROP_COLOR, zoneColor);
      
      ObjectSetString(0, THERM_PREFIX + "pct", OBJPROP_TEXT,
         "Percentile: " + DoubleToString(percentile, 1) + "%");
      
      ObjectSetString(0, THERM_PREFIX + "thresholds", OBJPROP_TEXT,
         "W: $" + DoubleToString(warningThr, 0) + " | C: $" + DoubleToString(criticalThr, 0));
      
      ChartRedraw();
   }

private:
   void CreateLabels()
   {
      CreateLabel("zone",       10, 5,  12, "INITIALIZING...", clrDimGray);
      CreateLabel("value",      10, 25, 10, "DD: --",          clrDimGray);
      CreateLabel("pct",        10, 42, 9,  "Percentile: --",  C'120,125,135');
      CreateLabel("thresholds", 10, 58, 8,  "W: -- | C: --",   C'90,95,105');
   }
   
   void CreateLabel(string suffix, int x, int y, int fontSize, string text, color clr)
   {
      string name = THERM_PREFIX + suffix;
      ObjectCreate(0, name, OBJ_LABEL, m_subwindow, 0, 0);
      ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
      ObjectSetInteger(0, name, OBJPROP_YDISTANCE, y);
      ObjectSetString(0, name, OBJPROP_TEXT, text);
      ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
      ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fontSize);
      ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
      ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   }

public:
   void Destroy()
   {
      ObjectDelete(0, THERM_PREFIX + "zone");
      ObjectDelete(0, THERM_PREFIX + "value");
      ObjectDelete(0, THERM_PREFIX + "pct");
      ObjectDelete(0, THERM_PREFIX + "thresholds");
      ChartRedraw();
   }
};

#endif
