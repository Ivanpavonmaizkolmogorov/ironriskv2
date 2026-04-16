package SQ.CustomAnalysis;

import com.strategyquant.lib.*;
import com.strategyquant.datalib.*;
import com.strategyquant.tradinglib.*;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.nio.charset.StandardCharsets;

public class IronRiskUploader extends CustomAnalysisMethod {

    // =========================================================
    //   CONFIGURACIÓN DE IRONRISK
    // =========================================================
    // 1. Token personal auto-inyectado
    private static final String IRONRISK_TOKEN = "irk_b1mrpT_Mkedlt9Qf79uqHDvB5hNoe7uzJ3Ybz5h2b90"; 
    
    // 2. Apunta a la IP de Localhost segura
    private static final String ENDPOINT = "http://127.0.0.1:8001/api/strategies/sqx-import";
    // =========================================================

    public IronRiskUploader() {
        super("IronRisk Cloud Sync", TYPE_FILTER_STRATEGY);
    }

    @Override
    public boolean filterStrategy(String project, String task, String databankName, ResultsGroup rg) throws Exception {
        
        // 1. Extraer Trades de la memoria del SQX
        OrdersList orders = rg.orders(); 
        if (orders == null || orders.size() == 0) {
            return true; // Saltar si el bot no tiene trades
        }

        // Buscar el Magic Number real en el primer trade válido
        int magic = 0;
        for (int i = 0; i < orders.size(); i++) {
            Order order = orders.get(i);
            if (!order.isBalanceOrder() && order.MagicNumber > 0) {
                magic = order.MagicNumber;
                break;
            }
        }
        // Fallback por seguridad: si no hubiera magic se crea uno derivado
        if (magic == 0) {
            magic = Math.abs(rg.getName().hashCode()); 
        }

        // 2. Construir el paquete JSON para el backend
        StringBuilder json = new StringBuilder();
        json.append("{");
        json.append("\"name\": \"").append(rg.getName()).append("\",");
        
        json.append("\"magic_number\": ").append(magic).append(",");
        json.append("\"max_drawdown_limit\": 0.0,"); 
        json.append("\"trades\": [");

        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss");

        boolean first = true;
        for (int i = 0; i < orders.size(); i++) {
            Order order = orders.get(i);
            
            // Filtramos depósitos o retiros (BalanceOrders)
            if(order.isBalanceOrder()) continue;
            
            if (!first) json.append(",");
            json.append("{");
            json.append("\"ticket\": ").append(i + 1).append(",");
            
            String openTime = sdf.format(new Date(order.OpenTime));
            String closeTime = sdf.format(new Date(order.CloseTime));
            
            json.append("\"open_time\": \"").append(openTime).append("\",");
            json.append("\"close_time\": \"").append(closeTime).append("\",");
            json.append("\"profit\": ").append(order.PL);
            json.append("}");
            first = false;
        }
        json.append("]");
        json.append("}");

        // 3. Disparar los datos a tu servidor
        try {
            URL url = new URL(ENDPOINT);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + IRONRISK_TOKEN);
            conn.setDoOutput(true);

            try (OutputStream os = conn.getOutputStream()) {
                byte[] input = json.toString().getBytes(StandardCharsets.UTF_8);
                os.write(input, 0, input.length);
            }

            int responseCode = conn.getResponseCode();
            if (responseCode == 200 || responseCode == 201) {
                // Éxito: Estrategia subida silenciosamente al Sandbox
            } else {
                debug("IronRisk", "Error subiendo estrategia: HTTP " + responseCode);
            }
        } catch (Exception e) {
            debug("IronRisk", "Error de red conectando con IronRisk: " + e.getMessage());
        }

        // Siempre devolvemos true para no bloquear el databank nativo
        return true; 
    }
}
