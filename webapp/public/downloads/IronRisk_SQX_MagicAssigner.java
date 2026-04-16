package SQ.CustomAnalysis;

import com.strategyquant.lib.*;
import com.strategyquant.datalib.*;
import com.strategyquant.tradinglib.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * IronRisk Magic Number Assigner v1.0
 * ====================================
 * Asigna MagicNumbers secuenciales a estrategias en StrategyQuant X.
 * 
 * INSTRUCCIONES:
 *   1. Copiar este archivo a: {SQX}/user/extend/Snippets/SQ/CustomAnalysis/
 *   2. En SQX, compilar el snippet (Code Editor → Compile).
 *   3. En Custom Projects, crear una tarea "Custom Analysis":
 *      - Per strategy analysis: UpdateCodeAndName
 *      - Input args: número inicial (ej. 100)
 *   4. Pulsar Start. Cada estrategia recibirá un MagicNumber secuencial.
 *   5. IMPORTANTE: Pulsar "Save" en el databank para persistir los cambios.
 *
 * Compatible con StrategyQuant X Build 142+ (MT4/MT5).
 * Requiere ejecución como "Per strategy analysis".
 */
public class UpdateCodeAndName extends CustomAnalysisMethod {

    public static final Logger Log = LoggerFactory.getLogger(UpdateCodeAndName.class);
    
    // Contador global — se inicializa desde Input Args
    private static int globalSequence = -1;

    public UpdateCodeAndName() {
        super("UpdateCodeAndName", TYPE_FILTER_STRATEGY);
    }

    @Override
    public boolean filterStrategy(String project, String task, String databankName, ResultsGroup rg) throws Exception {
        
        try {
            // Inicializar secuencia desde Input Args (solo la primera vez)
            if (globalSequence == -1) {
                String input = this.getInputArgs();
                if (input != null && !input.trim().isEmpty()) {
                    try {
                        globalSequence = Integer.parseInt(input.trim());
                    } catch (Exception ex) {
                        globalSequence = 1111;
                    }
                } else {
                    globalSequence = 1111;
                }
            }

            String oldName = rg.getName();
            
            // Protección contra renombramientos duplicados
            if (oldName.matches("^[0-9]+_.*")) {
                Log.info("UpdateCodeAndName: Estrategia ya procesada, ignorando -> " + oldName);
                return true; 
            }

            int currentMagic = globalSequence++;
            String newName = currentMagic + "_" + oldName;
            
            // 1. Renombrar estrategia en el visor del databank
            rg.setName(newName);
            Log.info("UpdateCodeAndName: " + oldName + " → " + newName);

            // 2. Metadatos de acceso rápido (SpecialValues)
            rg.specialValues().set("MagicNumber", (double) currentMagic);
            rg.specialValues().setString("MagicNumber", String.valueOf(currentMagic));

            // 3. Inyectar MagicNumber en todos los trades históricos (para IronRisk Uploader)
            try {
                OrdersList orders = rg.orders();
                if (orders != null && orders.size() > 0) {
                    for (int i = 0; i < orders.size(); i++) {
                        orders.get(i).MagicNumber = currentMagic;
                    }
                }
            } catch (Exception ordErr) { /* silenciar */ }

            // 4. Inyectar MagicNumber en el XML de la estrategia (código fuente MT4/MT5)
            // Patrón oficial extraído de: internal/Snippets/SQ/Columns/Databanks/MagicNumber.java
            try {
                org.jdom2.Element elVars = rg.getStrategyXml().getChild("Strategy").getChild("Variables");
                java.util.List<org.jdom2.Element> children = elVars.getChildren();
                for (int i = 0; i < children.size(); i++) {
                    org.jdom2.Element elVar = children.get(i);
                    String name = elVar.getChild("name").getText();
                    if (name.equals("MagicNumber")) {
                        elVar.getChild("value").setText(String.valueOf(currentMagic));
                        Log.info("UpdateCodeAndName: MagicNumber XML → " + currentMagic);
                        break;
                    }
                }
            } catch (Exception xmlError) {
                Log.error("UpdateCodeAndName: Error al modificar XML", xmlError);
            }

            return true;

        } catch (Exception e) {
            Log.error("UpdateCodeAndName: Error crítico", e);
            return true;
        }
    }
}
