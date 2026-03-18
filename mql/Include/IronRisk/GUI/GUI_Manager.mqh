//+------------------------------------------------------------------+
//| GUI_Manager.mqh — Button bar + chart event handler               |
//+------------------------------------------------------------------+
#ifndef IRONRISK_GUI_MANAGER_MQH
#define IRONRISK_GUI_MANAGER_MQH

#include "ButtonBar.mqh"

class CGUI_Manager
{
private:
   CButtonBar m_buttonBar;
   int        m_selectedStrategy;   // Index of selected strategy button
   string     m_strategyNames[];
   int        m_magicNumbers[];
   int        m_strategyCount;

public:
   CGUI_Manager() : m_selectedStrategy(0), m_strategyCount(0) {}
   
   //--- Initialize the GUI on chart
   void Init(int &magicNumbers[], string &names[], int count)
   {
      m_strategyCount = count;
      ArrayResize(m_strategyNames, count);
      ArrayResize(m_magicNumbers, count);
      
      for(int i = 0; i < count; i++)
      {
         m_strategyNames[i] = names[i];
         m_magicNumbers[i] = magicNumbers[i];
      }
      
      // Add GLOBAL button + one per strategy
      m_buttonBar.Init(10, 25);
      m_buttonBar.AddButton("GLOBAL", clrDodgerBlue);
      
      for(int i = 0; i < count; i++)
      {
         m_buttonBar.AddButton(names[i], clrDimGray);
      }
      
      m_buttonBar.Draw();
      m_selectedStrategy = 0;
   }
   
   //--- Handle chart events (call from OnChartEvent)
   int OnEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
   {
      if(id != CHARTEVENT_OBJECT_CLICK) return -1;
      
      int clicked = m_buttonBar.HandleClick(sparam);
      if(clicked < 0) return -1;
      
      m_selectedStrategy = clicked;
      m_buttonBar.SetActive(clicked);
      
      PrintFormat("[IronRisk GUI] Selected: %s", 
         clicked == 0 ? "GLOBAL" : m_strategyNames[clicked - 1]);
      
      return clicked;
   }
   
   //--- Get the magic number of the selected strategy (0 = GLOBAL)
   int GetSelectedMagic()
   {
      if(m_selectedStrategy == 0) return 0; // GLOBAL
      return m_magicNumbers[m_selectedStrategy - 1];
   }
   
   string GetSelectedName()
   {
      if(m_selectedStrategy == 0) return "GLOBAL";
      return m_strategyNames[m_selectedStrategy - 1];
   }
   
   //--- Cleanup
   void Deinit()
   {
      m_buttonBar.Destroy();
   }
};

#endif
