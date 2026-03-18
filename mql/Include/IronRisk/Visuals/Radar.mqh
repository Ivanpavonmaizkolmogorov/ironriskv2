//+------------------------------------------------------------------+
//| Radar.mqh — Advanced mode: PnL curve + floor/ceiling in subwindow|
//+------------------------------------------------------------------+
#ifndef IRONRISK_RADAR_MQH
#define IRONRISK_RADAR_MQH

#define RADAR_PREFIX    "IRK_RADAR_"
#define RADAR_BUF_SIZE  500

class CRadar
{
private:
   int    m_subwindow;
   double m_pnlBuffer[];
   double m_floorBuffer[];
   double m_ceilingBuffer[];
   int    m_bufferIndex;
   
public:
   CRadar() : m_subwindow(0), m_bufferIndex(0)
   {
      ArrayResize(m_pnlBuffer, RADAR_BUF_SIZE);
      ArrayResize(m_floorBuffer, RADAR_BUF_SIZE);
      ArrayResize(m_ceilingBuffer, RADAR_BUF_SIZE);
      ArrayInitialize(m_pnlBuffer, 0);
      ArrayInitialize(m_floorBuffer, 0);
      ArrayInitialize(m_ceilingBuffer, 0);
   }
   
   void Init(int subwindow)
   {
      m_subwindow = subwindow;
      m_bufferIndex = 0;
      
      // Create header labels
      CreateLabel("header",     10, 5,  10, "RADAR MODE", clrDodgerBlue);
      CreateLabel("pnl_label",  10, 22, 9,  "PnL: --",    clrLimeGreen);
      CreateLabel("floor_label",10, 38, 8,  "Floor: --",  clrRed);
      CreateLabel("ceil_label", 10, 52, 8,  "Ceiling: --", clrDimGray);
   }
   
   void Update(double currentPnl, double floor, double ceiling, string zone)
   {
      // Push to circular buffer
      m_pnlBuffer[m_bufferIndex % RADAR_BUF_SIZE] = currentPnl;
      m_floorBuffer[m_bufferIndex % RADAR_BUF_SIZE] = floor;
      m_ceilingBuffer[m_bufferIndex % RADAR_BUF_SIZE] = ceiling;
      m_bufferIndex++;
      
      // Update labels
      color pnlColor = currentPnl >= 0 ? clrLimeGreen : clrRed;
      
      ObjectSetString(0, RADAR_PREFIX + "pnl_label", OBJPROP_TEXT,
         "PnL: $" + DoubleToString(currentPnl, 2));
      ObjectSetInteger(0, RADAR_PREFIX + "pnl_label", OBJPROP_COLOR, pnlColor);
      
      ObjectSetString(0, RADAR_PREFIX + "floor_label", OBJPROP_TEXT,
         "Floor (2σ): $" + DoubleToString(floor, 2));
      
      ObjectSetString(0, RADAR_PREFIX + "ceil_label", OBJPROP_TEXT,
         "Ceiling (1σ): $" + DoubleToString(ceiling, 2));
      
      // Zone-based header color  
      color headerColor = clrLimeGreen;
      if(zone == "WARNING") headerColor = clrYellow;
      else if(zone == "CRITICAL") headerColor = clrRed;
      
      ObjectSetString(0, RADAR_PREFIX + "header", OBJPROP_TEXT, "RADAR [" + zone + "]");
      ObjectSetInteger(0, RADAR_PREFIX + "header", OBJPROP_COLOR, headerColor);
      
      ChartRedraw();
   }

private:
   void CreateLabel(string suffix, int x, int y, int fontSize, string text, color clr)
   {
      string name = RADAR_PREFIX + suffix;
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
      ObjectDelete(0, RADAR_PREFIX + "header");
      ObjectDelete(0, RADAR_PREFIX + "pnl_label");
      ObjectDelete(0, RADAR_PREFIX + "floor_label");
      ObjectDelete(0, RADAR_PREFIX + "ceil_label");
      ChartRedraw();
   }
};

#endif
