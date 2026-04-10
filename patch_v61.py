import os

file_in = r'c:\Users\ivanp\Desktop\Symbols\Porfolios\ironriskv2\webapp\public\downloads\IronRisk_Dashboard_v60.mq5'
file_out = r'c:\Users\ivanp\Desktop\Symbols\Porfolios\ironriskv2\webapp\public\downloads\IronRisk_Dashboard_v61.mq5'

with open(file_in, 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update SStrategyNode
text = text.replace(
'''struct SStrategyNode {
   long magic;
   string name;
};''',
'''struct SStrategyNode {
   long magic;
   string name;
   long associated_magics[];
};''')

# 2. Add g_ActiveMagics
text = text.replace(
'''long g_ActiveMagic=0;''',
'''long g_ActiveMagic=0;
long g_ActiveMagics[];
bool IsActiveMagic(long m)
{
   if(g_ActiveMagic == 0) return true;
   for(int i=0; i<ArraySize(g_ActiveMagics); i++) {
      if(g_ActiveMagics[i] == m) return true;
   }
   return false;
}''')

text = text.replace(
'''long g_ActiveMagic = 0;''',
'''long g_ActiveMagic = 0;
long g_ActiveMagics[];
bool IsActiveMagic(long m)
{
   if(g_ActiveMagic == 0) return true;
   for(int i=0; i<ArraySize(g_ActiveMagics); i++) {
      if(g_ActiveMagics[i] == m) return true;
   }
   return false;
}''')


# 3. Update RefreshStrategies parsing inside RefreshStrategies block
old_parse = '''for(int i=0;i<cnt;i++) { if(st[i]=="") continue; string p[]; if(StringSplit(st[i],'|',p)==2) { ns[nt].magic=StringToInteger(p[0]); ns[nt].name=p[1]; nt++; } }'''
new_parse = '''for(int i=0;i<cnt;i++) { 
         if(st[i]=="") continue; 
         string p[]; 
         int parts = StringSplit(st[i],'|',p);
         if(parts >= 2) { 
            ns[nt].magic = StringToInteger(p[0]); 
            ns[nt].name = p[1]; 
            if(parts >= 3 && p[2] != "") {
               string subm[]; 
               int scnt = StringSplit(p[2], ',', subm);
               ArrayResize(ns[nt].associated_magics, scnt);
               for(int m=0; m<scnt; m++) ns[nt].associated_magics[m] = StringToInteger(subm[m]);
            } else {
               ArrayResize(ns[nt].associated_magics, 1);
               ns[nt].associated_magics[0] = ns[nt].magic;
            }
            nt++; 
         } 
      }'''
text = text.replace(old_parse, new_parse)

old_assign = '''for(int i=0;i<nt;i++){g_Strategies[i].magic=ns[i].magic; g_Strategies[i].name=ns[i].name;}'''
new_assign = '''for(int i=0;i<nt;i++){
            g_Strategies[i].magic=ns[i].magic; 
            g_Strategies[i].name=ns[i].name;
            ArrayCopy(g_Strategies[i].associated_magics, ns[i].associated_magics);
         }'''
text = text.replace(old_assign, new_assign)

# 4. g_ActiveMagic array copy assignments
text = text.replace(
'''if(g_TotalStrategies>0) { g_ActiveMagic=g_Strategies[0].magic; g_ActiveName=g_Strategies[0].name; }''',
'''if(g_TotalStrategies>0) { g_ActiveMagic=g_Strategies[0].magic; g_ActiveName=g_Strategies[0].name; ArrayCopy(g_ActiveMagics, g_Strategies[0].associated_magics); }'''
)

text = text.replace(
'''g_ActiveMagic=g_Strategies[ci].magic;
         g_ActiveName=g_Strategies[ci].name;
         g_PeakPnL=0.0;''',
'''g_ActiveMagic=g_Strategies[ci].magic;
         g_ActiveName=g_Strategies[ci].name;
         ArrayCopy(g_ActiveMagics, g_Strategies[ci].associated_magics);
         g_PeakPnL=0.0;'''
)


# 5. Overwrite the condition logic in 3 places
text = text.replace('''if(g_ActiveMagic==0 || g_ActiveMagic==mag)''', '''if(IsActiveMagic(mag))''')
text = text.replace('''if(g_ActiveMagic!=0 && m!=g_ActiveMagic) continue;''', '''if(!IsActiveMagic(m)) continue;''')
text = text.replace('''if(g_ActiveMagic != 0 && mag != g_ActiveMagic) continue;''', '''if(!IsActiveMagic(mag)) continue;''')

# 6. Change dashboard version text from v60 to v61
text = text.replace('IRONRISK DASHBOARD v60', 'IRONRISK DASHBOARD v61')
text = text.replace('IRONRISK DASHBOARD v59', 'IRONRISK DASHBOARD v61')

with open(file_out, 'w', encoding='utf-8') as f:
    f.write(text)

print("Created v61 successfully")
