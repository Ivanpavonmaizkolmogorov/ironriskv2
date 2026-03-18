//+------------------------------------------------------------------+
//| ButtonBar.mqh — Horizontal button strip on chart                 |
//+------------------------------------------------------------------+
#ifndef IRONRISK_BUTTON_BAR_MQH
#define IRONRISK_BUTTON_BAR_MQH

#define MAX_BUTTONS 10
#define BTN_PREFIX  "IRK_BTN_"
#define BTN_WIDTH   90
#define BTN_HEIGHT  22
#define BTN_GAP     4

class CButtonBar
{
private:
   string m_labels[MAX_BUTTONS];
   color  m_colors[MAX_BUTTONS];
   int    m_count;
   int    m_startX;
   int    m_startY;
   int    m_activeIndex;

public:
   CButtonBar() : m_count(0), m_startX(10), m_startY(25), m_activeIndex(0) {}
   
   void Init(int x, int y)
   {
      m_startX = x;
      m_startY = y;
      m_count = 0;
      m_activeIndex = 0;
   }
   
   void AddButton(string label, color clr)
   {
      if(m_count >= MAX_BUTTONS) return;
      m_labels[m_count] = label;
      m_colors[m_count] = clr;
      m_count++;
   }
   
   void Draw()
   {
      for(int i = 0; i < m_count; i++)
      {
         string name = BTN_PREFIX + IntegerToString(i);
         int x = m_startX + i * (BTN_WIDTH + BTN_GAP);
         
         ObjectCreate(0, name, OBJ_BUTTON, 0, 0, 0);
         ObjectSetInteger(0, name, OBJPROP_XDISTANCE, x);
         ObjectSetInteger(0, name, OBJPROP_YDISTANCE, m_startY);
         ObjectSetInteger(0, name, OBJPROP_XSIZE, BTN_WIDTH);
         ObjectSetInteger(0, name, OBJPROP_YSIZE, BTN_HEIGHT);
         ObjectSetString(0, name, OBJPROP_TEXT, m_labels[i]);
         ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 8);
         ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
         ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
         ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
         
         if(i == m_activeIndex)
         {
            ObjectSetInteger(0, name, OBJPROP_BGCOLOR, m_colors[i]);
            ObjectSetInteger(0, name, OBJPROP_COLOR, clrWhite);
            ObjectSetInteger(0, name, OBJPROP_BORDER_COLOR, m_colors[i]);
         }
         else
         {
            ObjectSetInteger(0, name, OBJPROP_BGCOLOR, C'30,34,43');
            ObjectSetInteger(0, name, OBJPROP_COLOR, C'150,155,165');
            ObjectSetInteger(0, name, OBJPROP_BORDER_COLOR, C'60,65,75');
         }
      }
      ChartRedraw();
   }
   
   int HandleClick(const string &sparam)
   {
      for(int i = 0; i < m_count; i++)
      {
         if(sparam == BTN_PREFIX + IntegerToString(i))
         {
            // Reset button state (OBJ_BUTTON auto-toggles)
            ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
            return i;
         }
      }
      return -1;
   }
   
   void SetActive(int index)
   {
      m_activeIndex = index;
      Draw();
   }
   
   void Destroy()
   {
      for(int i = 0; i < m_count; i++)
      {
         ObjectDelete(0, BTN_PREFIX + IntegerToString(i));
      }
      ChartRedraw();
   }
};

#endif
