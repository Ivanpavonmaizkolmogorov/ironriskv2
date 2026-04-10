//+------------------------------------------------------------------+
//| IronRisk_DealInspector.mq5 - Diagnostic Script                   |
//| Prints the last 10 closed deals with ALL available fields         |
//+------------------------------------------------------------------+
#property script_show_inputs
#property copyright "IronRisk"

input int MaxDeals = 10; // How many recent deals to inspect

void OnStart()
  {
   if(!HistorySelect(0, TimeCurrent()))
     {
      Print("ERROR: HistorySelect failed");
      return;
     }
     
   int total = HistoryDealsTotal();
   Print("========================================");
   Print("  IRONRISK DEAL INSPECTOR");
   Print("  Total deals in history: ", total);
   Print("========================================");
   
   int count = 0;
   for(int d = total - 1; d >= 0 && count < MaxDeals; d--)
     {
      ulong tk = HistoryDealGetTicket(d);
      if(tk <= 0) continue;
      
      long entry = HistoryDealGetInteger(tk, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_INOUT) continue;
      
      count++;
      
      // All fields
      long     magic     = HistoryDealGetInteger(tk, DEAL_MAGIC);
      long     dealType  = HistoryDealGetInteger(tk, DEAL_TYPE);
      datetime dealTime  = (datetime)HistoryDealGetInteger(tk, DEAL_TIME);
      string   symbol    = HistoryDealGetString(tk, DEAL_SYMBOL);
      double   volume    = HistoryDealGetDouble(tk, DEAL_VOLUME);
      double   profit    = HistoryDealGetDouble(tk, DEAL_PROFIT);
      double   swap      = HistoryDealGetDouble(tk, DEAL_SWAP);
      double   commission= HistoryDealGetDouble(tk, DEAL_COMMISSION);
      string   comment   = HistoryDealGetString(tk, DEAL_COMMENT);
      long     order     = HistoryDealGetInteger(tk, DEAL_ORDER);
      long     posId     = HistoryDealGetInteger(tk, DEAL_POSITION_ID);
      string   extId     = HistoryDealGetString(tk, DEAL_EXTERNAL_ID);
      
      Print("--- Deal #", count, " ---");
      Print("  Ticket:      ", tk);
      Print("  Order:       ", order);
      Print("  PositionID:  ", posId);
      Print("  Magic:       ", magic);
      Print("  Symbol:      ", symbol);
      Print("  Type:        ", dealType == DEAL_TYPE_BUY ? "BUY" : "SELL");
      Print("  Volume:      ", DoubleToString(volume, 2));
      Print("  Profit:      ", DoubleToString(profit, 2));
      Print("  Swap:        ", DoubleToString(swap, 2));
      Print("  Commission:  ", DoubleToString(commission, 2));
      Print("  Net:         ", DoubleToString(profit + swap + commission, 2));
      Print("  Time:        ", TimeToString(dealTime, TIME_DATE|TIME_SECONDS));
      Print("  COMMENT:     [", comment, "]");
      Print("  ExternalID:  [", extId, "]");
      Print("");
     }
     
   Print("========================================");
   Print("  Inspection complete: ", count, " deals shown");
   Print("========================================");
  }
