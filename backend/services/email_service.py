import smtplib
from email.message import EmailMessage
from email.utils import formataddr
import logging
import os
from dotenv import load_dotenv
from models.database import get_settings

# Forced loading to capture changes immediately
load_dotenv(override=True)

logger = logging.getLogger(__name__)

# Single source of truth for EA download — must match webapp/src/config/ea.ts
EA_FILENAME = "IronRisk_Dashboard_v66.ex5"
EA_DOWNLOAD_URL = f"https://ironrisk.pro/downloads/{EA_FILENAME}"

class EmailService:
    def __init__(self, 
                 smtp_server: str = "smtp.gmail.com", 
                 smtp_port: int = 587, 
                 sender_email: str = None, 
                 sender_password: str = None):
        # We try to load from environment if not explicitly passed
        self.smtp_server = smtp_server
        self.smtp_port = smtp_port
        self.sender_email = sender_email or os.getenv("SMTP_EMAIL", "ironrisk.shield@gmail.com")
        self.sender_password = sender_password or os.getenv("SMTP_PASSWORD")

    def is_configured(self) -> bool:
        """Check if the SMTP credentials are fully provided."""
        return bool(self.sender_email and self.sender_password)

    def send_welcome_email(self, recipient_email: str, locale: str = "es") -> bool:
        """
        Sends an HTML welcome email with the EA download links to the registered user.
        Executes synchronously (should be called in a background task or threaded).
        """
        print(f"\n📧 [EMAIL SERVICE] Intentando enviar email de bienvenida a: {recipient_email}")
        
        if not self.is_configured():
            print(f"❌ [EMAIL SERVICE ERROR] Faltan credenciales! Revisa tu .env y reinicia el servidor. Email: {self.sender_email}, Password: {'[Configurado]' if self.sender_password else '[NO CONFIGURADO]'}")
            logger.warning(f"EmailService not configured. Skipping welcome email to {recipient_email}.")
            return False

        if locale == "en":
            subject = "Welcome to IronRisk - Project Your Statistical Edge"
            html_content = f"""
            <html>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 20px; background-color: #0d1117; background-image: linear-gradient(#0d1117, #0d1117); color: #c9d1d9;">
                <div style="max-w-lg: 600px; margin: 0 auto; background-color: #161b22; background-image: linear-gradient(#161b22, #161b22); padding: 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); border-top: 5px solid #00e676; border: 1px solid #30363d;">
                    <a href="https://www.ironrisk.pro" style="display: inline-block; margin-bottom: 10px;"><img src="https://www.ironrisk.pro/email-logo.png" alt="IronRisk" style="height: 36px; width: auto;" /></a>
                    <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">Hello,</p>
                    <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">
                        Your lifetime account has been successfully provisioned for access with the email: <strong style="color: #c9d1d9;">{recipient_email}</strong>
                    </p>
                    
                    <h3 style="font-size: 18px; color: #e6edf3; margin-top: 30px;">Next Step: Connect MetaTrader</h3>
                    <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">
                        You are one step away from projecting your statistical probability. To start computing Bayesian data in real-time, install our MQL5 engine on your chosen MetaTrader chart.
                    </p>
                    
                    <div style="text-align: center; margin: 35px 0;">
                        <a href="{EA_DOWNLOAD_URL}" 
                           style="display: inline-block; padding: 14px 28px; background-color: #00e676; color: #000000; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                           Download MQL5 Engine
                        </a>
                    </div>
    
                    <div style="background-color: rgba(255, 235, 59, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #fbc02d; margin-bottom: 25px;">
                        <p style="margin: 0; font-size: 14px; color: #fbc02d;">
                            <strong>Important:</strong> The Workspace is cryptographically bound. You must paste the <em>API Token</em> and ensure your <em>MT5 Account Number</em> matches exactly the one configured on the web, otherwise the connection will be rejected.
                        </p>
                    </div>
    
                    <p style="font-size: 14px; color: #484f58; margin-top: 40px; border-top: 1px solid #30363d; padding-top: 20px;">
                        Any doubts? Reply directly to this email.<br>
                        <strong style="color: #8b949e;">Iván P.</strong> <span style="color: #484f58;">— Founder & Lead Developer</span><br>
                        <a href="https://www.ironrisk.pro" style="color: #00e676; text-decoration: none; font-size: 12px;">www.ironrisk.pro</a>
                    </p>
                </div>
              </body>
            </html>
            """
        else:
            subject = "Bienvenido a IronRisk - Proyecta tu Edge Matemático"
            html_content = f"""
            <html>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 20px; background-color: #0d1117; background-image: linear-gradient(#0d1117, #0d1117); color: #c9d1d9;">
                <div style="max-w-lg: 600px; margin: 0 auto; background-color: #161b22; background-image: linear-gradient(#161b22, #161b22); padding: 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); border-top: 5px solid #00e676; border: 1px solid #30363d;">
                    <a href="https://www.ironrisk.pro" style="display: inline-block; margin-bottom: 10px;"><img src="https://www.ironrisk.pro/email-logo.png" alt="IronRisk" style="height: 36px; width: auto;" /></a>
                    <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">Hola,</p>
                    <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">
                        Tu cuenta vitalicia ha sido provisionada exitosamente para el acceso con el correo: <strong style="color: #c9d1d9;">{recipient_email}</strong>
                    </p>
                    
                    <h3 style="font-size: 18px; color: #e6edf3; margin-top: 30px;">Próximo Paso: Conecta tu MetaTrader</h3>
                    <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">
                        Estás a un paso de proyectar tu probabilidad estadística. Para comenzar a ver datos Bayesianos en tiempo real, instala nuestro motor MQL5 en el gráfico de tu terminal MetaTrader que quieras vincular.
                    </p>
                    
                    <div style="text-align: center; margin: 35px 0;">
                        <a href="{EA_DOWNLOAD_URL}" 
                           style="display: inline-block; padding: 14px 28px; background-color: #00e676; color: #000000; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                           Descargar MQL5 Engine
                        </a>
                    </div>
    
                    <div style="background-color: rgba(255, 235, 59, 0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #fbc02d; margin-bottom: 25px;">
                        <p style="margin: 0; font-size: 14px; color: #fbc02d;">
                            <strong>Importante:</strong> El Workspace está protegido gráficamente. Deberás pegar el <em>API Token</em> y asegurarte de que tu <em>Número de Cuenta de MT5</em> coincide exactamente con el que configuraste en la web, de lo contrario la conexión será rechazada.
                        </p>
                    </div>
    
                    <p style="font-size: 14px; color: #484f58; margin-top: 40px; border-top: 1px solid #30363d; padding-top: 20px;">
                        ¿Tienes dudas? Responde directamente a este correo.<br>
                        <strong style="color: #8b949e;">Iván P.</strong> <span style="color: #484f58;">— Founder & Lead Developer</span><br>
                        <a href="https://www.ironrisk.pro" style="color: #00e676; text-decoration: none; font-size: 12px;">www.ironrisk.pro</a>
                    </p>
                </div>
              </body>
            </html>
            """
        
        msg = EmailMessage()
        msg['Subject'] = subject
        sender_name = "Ivan from IronRisk" if locale == "en" else "Iván de IronRisk"
        msg['From'] = formataddr((sender_name, self.sender_email))
        msg['To'] = recipient_email
        msg.set_content("Abre este correo en un cliente que soporte renderizado HTML para ver las instrucciones.")
        msg.add_alternative(html_content, subtype='html')

        try:
            print("⏳ [EMAIL SERVICE] Conectando a smtp.gmail.com:587...")
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.set_debuglevel(1)
                server.starttls()
                server.login(self.sender_email, self.sender_password)
                server.send_message(msg)
            
            print(f"✅ [EMAIL SERVICE SUCCESS] ¡Email inyectado en la bandeja de {recipient_email} exitosamente!")
            logger.info(f"Welcome email successfully dispatched to {recipient_email}")
            return True
        except Exception as e:
            print(f"🔥 [EMAIL SERVICE EXCEPTION] Error catastrófico enviando a {recipient_email}: {e}")
            logger.error(f"Failed to transmit welcome email to {recipient_email}: {e}")
            return False

    def send_verification_email(self, recipient_email: str, token: str, locale: str = "es") -> bool:
        """Sends an email with a verification link to confirm the user's email address."""
        if not self.is_configured():
            logger.warning(f"EmailService not configured. Skipping verification email to {recipient_email}.")
            return False

        settings = get_settings()
        frontend_url = getattr(settings, "FRONTEND_URL", "https://www.ironrisk.pro")
        verify_url = f"{frontend_url}/{locale}/verify-email?token={token}"

        if locale == "en":
            subject = "IronRisk — Verify Your Email"
            lbl_title = "Confirm Your Email"
            lbl_desc = f"You've registered with <strong>{recipient_email}</strong>. Click below to verify your email and unlock all features."
            lbl_btn = "Verify Email"
            lbl_skip = "You can skip this step, but some features may be limited."
            lbl_footer = "The IronRisk Quant Team"
        else:
            subject = "IronRisk — Verifica tu Email"
            lbl_title = "Confirma tu Correo"
            lbl_desc = f"Te has registrado con <strong>{recipient_email}</strong>. Haz click abajo para verificar tu correo y desbloquear todas las funciones."
            lbl_btn = "Verificar Email"
            lbl_skip = "Puedes saltar este paso, pero algunas funciones podrían estar limitadas."
            lbl_footer = "El Equipo de Cuantificación de IronRisk"

        html_content = f"""
        <html>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 20px; background-color: #0d1117; background-image: linear-gradient(#0d1117, #0d1117); color: #c9d1d9;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #161b22; background-image: linear-gradient(#161b22, #161b22); padding: 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); border-top: 5px solid #00e676; border: 1px solid #30363d;">
                <a href="https://www.ironrisk.pro" style="display: inline-block; margin-bottom: 10px;"><img src="https://www.ironrisk.pro/email-logo.png" alt="IronRisk" style="height: 36px; width: auto;" /></a>
                <h2 style="color: #00e676; margin-top: 10px; font-size: 20px; font-weight: 800;">{lbl_title}</h2>
                <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">{lbl_desc}</p>
                
                <div style="text-align: center; margin: 35px 0;">
                    <a href="{verify_url}" 
                       style="display: inline-block; padding: 14px 28px; background-color: #00e676; color: #000000; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                       {lbl_btn}
                    </a>
                </div>

                <p style="font-size: 13px; color: #484f58; text-align: center; margin-bottom: 25px;">
                    {lbl_skip}
                </p>

                <p style="font-size: 14px; color: #484f58; margin-top: 40px; border-top: 1px solid #30363d; padding-top: 20px;">
                    <strong style="color: #8b949e;">{lbl_footer}</strong><br>
                    <a href="https://www.ironrisk.pro" style="color: #00e676; text-decoration: none; font-size: 12px;">www.ironrisk.pro</a>
                </p>
            </div>
          </body>
        </html>
        """

        msg = EmailMessage()
        msg['Subject'] = subject
        sender_name = "Ivan from IronRisk" if locale == "en" else "Iván de IronRisk"
        msg['From'] = formataddr((sender_name, self.sender_email))
        msg['To'] = recipient_email
        msg.set_content("Verifica tu email para completar tu registro en IronRisk.")
        msg.add_alternative(html_content, subtype='html')

        try:
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.sender_email, self.sender_password)
                server.send_message(msg)
            logger.info(f"✅ Verification email sent to {recipient_email}")
            return True
        except Exception as e:
            logger.error(f"Failed to send verification email to {recipient_email}: {e}")
            return False

    def send_password_reset_email(self, recipient_email: str, token: str, locale: str = "es") -> bool:
        """
        Sends an HTML email with a secure link to reset the user's password.
        """
        if not self.is_configured():
            logger.warning(f"EmailService not configured. Skipping reset email to {recipient_email}.")
            return False

        if locale == "en":
            subject = "IronRisk - Password Reset Request"
            lbl_title = "Password Recovery"
            lbl_desc = f"We received a request to recover access for the account linked to <strong>{recipient_email}</strong>. If you didn't request this, you can safely ignore this email."
            lbl_btn = "Reset My Password"
            lbl_warn = "This secure link will expire in 30 minutes."
            lbl_footer = "The IronRisk Quant Team"
        else:
            subject = "IronRisk - Solicitud de Recuperación de Contraseña"
            lbl_title = "Recuperación de Acceso"
            lbl_desc = f"Hemos recibido una solicitud para recuperar el acceso de la cuenta vinculada a <strong>{recipient_email}</strong>. Si no has sido tú, simplemente ignora este correo."
            lbl_btn = "Restablecer Mi Contraseña"
            lbl_warn = "Este enlace de seguridad caducará en 30 minutos."
            lbl_footer = "El Equipo de Cuantificación de IronRisk"

        settings = get_settings()
        frontend_url = getattr(settings, "FRONTEND_URL", "https://www.ironrisk.pro")
        reset_url = f"{frontend_url}/{locale}/reset-password?token={token}"

        html_content = f"""
        <html>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 20px; background-color: #0d1117; background-image: linear-gradient(#0d1117, #0d1117); color: #c9d1d9;">
            <div style="max-w-lg: 600px; margin: 0 auto; background-color: #161b22; background-image: linear-gradient(#161b22, #161b22); padding: 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); border-top: 5px solid #ff4d4d; border: 1px solid #30363d;">
                <a href="https://www.ironrisk.pro" style="display: inline-block; margin-bottom: 10px;"><img src="https://www.ironrisk.pro/email-logo.png" alt="IronRisk" style="height: 36px; width: auto;" /></a>
                <h2 style="color: #ff4d4d; margin-top: 10px; font-size: 20px; font-weight: 800;">{lbl_title}</h2>
                <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">{lbl_desc}</p>
                
                <div style="text-align: center; margin: 35px 0;">
                    <a href="{reset_url}" 
                       style="display: inline-block; padding: 14px 28px; background-color: #ff4d4d; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                       {lbl_btn}
                    </a>
                </div>

                <p style="font-size: 13px; color: #8b949e; text-align: center; margin-bottom: 25px;">
                    {lbl_warn}
                </p>

                <p style="font-size: 14px; color: #484f58; margin-top: 40px; border-top: 1px solid #30363d; padding-top: 20px;">
                    <strong style="color: #8b949e;">{lbl_footer}</strong><br>
                    <a href="https://www.ironrisk.pro" style="color: #00e676; text-decoration: none; font-size: 12px;">www.ironrisk.pro</a>
                </p>
            </div>
          </body>
        </html>
        """
        
        msg = EmailMessage()
        msg['Subject'] = subject
        msg['From'] = f"IronRisk Security <{self.sender_email}>"
        msg['To'] = recipient_email
        msg.set_content("Abre este correo en un cliente que soporte renderizado HTML.")
        msg.add_alternative(html_content, subtype='html')

        try:
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.sender_email, self.sender_password)
                server.send_message(msg)
            return True
        except Exception as e:
            logger.error(f"Failed to transmit reset email to {recipient_email}: {e}")
            return False

    def send_waitlist_confirmation(self, recipient_email: str, locale: str = "es") -> bool:
        """Sends a confirmation email when someone joins the waitlist."""
        if not self.is_configured():
            logger.warning(f"EmailService not configured. Skipping waitlist email to {recipient_email}.")
            return False

        if locale == "en":
            subject = "You're on the IronRisk Waitlist 🛡️"
            html_content = f"""
            <html>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 20px; background-color: #0d1117; background-image: linear-gradient(#0d1117, #0d1117); color: #c9d1d9;">
                <div style="max-w-lg: 600px; margin: 0 auto; background-color: #161b22; background-image: linear-gradient(#161b22, #161b22); padding: 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); border-top: 5px solid #00e676; border: 1px solid #30363d;">
                    <a href="https://www.ironrisk.pro" style="display: inline-block; margin-bottom: 10px;"><img src="https://www.ironrisk.pro/email-logo.png" alt="IronRisk" style="height: 36px; width: auto;" /></a>
                    <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">Hello,</p>
                    <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">
                        You've been added to the <strong style="color: #c9d1d9;">IronRisk private waitlist</strong> with the email <strong style="color: #c9d1d9;">{recipient_email}</strong>.
                    </p>
                    <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">
                        We're currently in <strong style="color: #00e676;">closed beta</strong> and onboarding traders in small batches to ensure quality and support.
                    </p>
                    <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">
                        When your spot opens, you'll receive an invite code directly to this email. No action needed on your end — just sit tight.
                    </p>

                    <div style="text-align: center; margin: 35px 0;">
                        <a href="https://www.ironrisk.pro/en/simulate" 
                           style="display: inline-block; padding: 14px 28px; background-color: #00e676; color: #0d1117; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                           Try the Free Simulator →
                        </a>
                    </div>

                    <p style="font-size: 13px; color: #484f58; text-align: center;">
                        While you wait, you can already analyze your backtests for free.
                    </p>
    
                    <p style="font-size: 14px; color: #484f58; margin-top: 40px; border-top: 1px solid #30363d; padding-top: 20px;">
                        Any doubts? Reply directly to this email.<br>
                        <strong style="color: #8b949e;">Iván P.</strong> <span style="color: #484f58;">— Founder & Lead Developer</span><br>
                        <a href="https://www.ironrisk.pro" style="color: #00e676; text-decoration: none; font-size: 12px;">www.ironrisk.pro</a>
                    </p>
                </div>
              </body>
            </html>
            """
        else:
            subject = "Estás en la Lista de Espera de IronRisk 🛡️"
            html_content = f"""
            <html>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 20px; background-color: #0d1117; background-image: linear-gradient(#0d1117, #0d1117); color: #c9d1d9;">
                <div style="max-w-lg: 600px; margin: 0 auto; background-color: #161b22; background-image: linear-gradient(#161b22, #161b22); padding: 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); border-top: 5px solid #00e676; border: 1px solid #30363d;">
                    <a href="https://www.ironrisk.pro" style="display: inline-block; margin-bottom: 10px;"><img src="https://www.ironrisk.pro/email-logo.png" alt="IronRisk" style="height: 36px; width: auto;" /></a>
                    <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">Hola,</p>
                    <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">
                        Has sido añadido a la <strong style="color: #c9d1d9;">lista de espera privada de IronRisk</strong> con el correo <strong style="color: #c9d1d9;">{recipient_email}</strong>.
                    </p>
                    <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">
                        Actualmente estamos en <strong style="color: #00e676;">beta cerrada</strong>, incorporando traders en grupos reducidos para garantizar calidad y soporte.
                    </p>
                    <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">
                        Cuando tu plaza esté lista, recibirás un código de invitación directamente en este correo. No necesitas hacer nada más — te avisamos nosotros.
                    </p>

                    <div style="text-align: center; margin: 35px 0;">
                        <a href="https://www.ironrisk.pro/es/simulate" 
                           style="display: inline-block; padding: 14px 28px; background-color: #00e676; color: #0d1117; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                           Prueba el Simulador Gratis →
                        </a>
                    </div>

                    <p style="font-size: 13px; color: #484f58; text-align: center;">
                        Mientras esperas, ya puedes analizar tus backtests gratuitamente.
                    </p>
    
                    <p style="font-size: 14px; color: #484f58; margin-top: 40px; border-top: 1px solid #30363d; padding-top: 20px;">
                        ¿Tienes dudas? Responde directamente a este correo.<br>
                        <strong style="color: #8b949e;">Iván P.</strong> <span style="color: #484f58;">— Founder & Lead Developer</span><br>
                        <a href="https://www.ironrisk.pro" style="color: #00e676; text-decoration: none; font-size: 12px;">www.ironrisk.pro</a>
                    </p>
                </div>
              </body>
            </html>
            """

        try:
            msg = EmailMessage()
            msg["Subject"] = subject
            sender_name = "Ivan from IronRisk" if locale == "en" else "Iván de IronRisk"
            msg["From"] = formataddr((sender_name, self.sender_email))
            msg["To"] = recipient_email
            msg.set_content("You've been added to the IronRisk waitlist.")
            msg.add_alternative(html_content, subtype="html")

            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.sender_email, self.sender_password)
                server.send_message(msg)
            logger.info(f"✅ Waitlist confirmation sent to {recipient_email}")
            return True
        except Exception as e:
            logger.error(f"Failed to send waitlist email to {recipient_email}: {e}")
            return False

    def send_access_granted_email(self, recipient_email: str, login_url: str, locale: str = "es") -> bool:
        """Sends 'your account is ready, log in now' email to an approved waitlist user."""
        if not self.is_configured():
            logger.warning(f"EmailService not configured. Skipping access email to {recipient_email}.")
            return False

        try:
            if locale == "en":
                subject = "🛡️ Your IronRisk access is ready"
                headline = "You're in."
                body_p1 = "Your access to <strong style=\"color: #c9d1d9;\">IronRisk</strong> has been activated. You can now log in directly using the email and password you used when you registered."
                btn_text = "Log in to IronRisk →"
                spam_note = "⚠️ If you didn't request access, you can ignore this email."
            else:
                subject = "🛡️ Tu acceso a IronRisk está listo"
                headline = "Estás dentro."
                body_p1 = "Tu acceso a <strong style=\"color: #c9d1d9;\">IronRisk</strong> ha sido activado. Ya puedes entrar directamente con el correo y la contraseña que usaste al registrarte."
                btn_text = "Entrar a IronRisk →"
                spam_note = "⚠️ Si no solicitaste acceso, puedes ignorar este correo."

            html_content = f"""
            <html>
              <body style="background-color: #0d1117; background-image: linear-gradient(#0d1117, #0d1117); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 40px 20px;">
                <div style="max-width: 520px; margin: 0 auto; background-color: #161b22; background-image: linear-gradient(#161b22, #161b22); border: 1px solid #30363d; border-radius: 12px; padding: 40px;">
                    <div style="text-align: center; margin-bottom: 32px;">
                        <span style="font-size: 32px;">🛡️</span>
                        <h1 style="color: #00e676; font-size: 22px; margin: 12px 0 4px;">{headline}</h1>
                    </div>
                    <p style="font-size: 15px; color: #8b949e; line-height: 1.6;">{body_p1}</p>

                    <div style="text-align: center; margin: 32px 0;">
                        <a href="{login_url}"
                           style="display: inline-block; padding: 16px 32px; background-color: #00e676; color: #0d1117; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                           {btn_text}
                        </a>
                    </div>

                    <div style="background-color: #1c2128; border: 1px solid #f0883e33; border-radius: 8px; padding: 12px 16px; margin: 24px 0;">
                        <p style="font-size: 12px; color: #f0883e; margin: 0;">
                            {spam_note}
                        </p>
                    </div>

                    <p style="font-size: 13px; color: #484f58; margin-top: 32px; border-top: 1px solid #30363d; padding-top: 20px;">
                        <strong style="color: #8b949e;">Iván P.</strong> <span style="color: #484f58;">— Founder & Lead Developer</span><br>
                        <a href="https://www.ironrisk.pro" style="color: #00e676; text-decoration: none; font-size: 12px;">www.ironrisk.pro</a>
                    </p>
                </div>
              </body>
            </html>
            """

            msg = EmailMessage()
            msg["Subject"] = subject
            sender_name = "Ivan from IronRisk" if locale == "en" else "Iván de IronRisk"
            msg["From"] = formataddr((sender_name, self.sender_email))
            msg["To"] = recipient_email
            msg.set_content(f"Tu acceso a IronRisk está listo. Entra en: {login_url}")
            msg.add_alternative(html_content, subtype="html")

            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.sender_email, self.sender_password)
                server.send_message(msg)
            logger.info(f"✅ Access granted email sent to {recipient_email}")
            return True
        except Exception as e:
            logger.error(f"Failed to send access email to {recipient_email}: {e}")
            return False

    def send_beta_reactivation(self, recipient_email: str, locale: str = "es") -> bool:
        """Sends a reactivation email to a waitlist lead inviting them to test the beta."""
        if not self.is_configured():
            logger.warning(f"EmailService not configured. Skipping reactivation email to {recipient_email}.")
            return False

        if locale == "en":
            subject = "You signed up for IronRisk a few weeks ago (and I need your feedback)"
            demo_url = "https://www.ironrisk.pro/en"
            body_paragraphs = """
                <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">Hi,</p>

                <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">
                    A few weeks ago you joined the IronRisk waitlist. I'm Ivan — I built the whole thing solo.
                </p>

                <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">
                    Sorry for the silence. I've been heads-down coding and testing it on my own MT5 accounts to make sure it actually works before showing it to anyone.
                </p>

                <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">
                    I just uploaded a quick <strong style="color: #c9d1d9;">1-minute demo</strong> showing how the real-time visual shield works to stop panic-closing during normal drawdowns.
                </p>

                <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">
                    Right now I'm looking for a <strong style="color: #00e676;">very small group of real systematic traders</strong> to test the beta, try to break it, and give me brutally honest feedback.
                </p>
            """
            cta_btn = "Watch the 1-min Demo"
            reply_line = 'If the math and the logic make sense to you, reply with <strong style="color: #00e676;">"I\'m in"</strong> and I\'ll activate your account today.'
            ps_text = '<strong style="color: #c9d1d9;">P.S.</strong> — The tool flagged one of my USDJPY strategies with a 38% Blind Risk — a real probability that my edge didn\'t exist. I stopped trusting it in live. That\'s exactly the kind of decision it helps you make before you lose more.'
            bug_text = '<strong style="color: #c9d1d9;">Direct line:</strong> Once inside, you\'ll find a <strong style="color: #00e676;">bug icon at the bottom-right</strong> of every screen. One tap and your report lands directly in my Telegram — no tickets, no support queue. You talk to the developer, not a bot.'
        else:
            subject = "Te apuntaste a IronRisk hace unas semanas (y necesito tu feedback)"
            demo_url = "https://www.ironrisk.pro/es"
            body_paragraphs = """
                <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">Hola,</p>

                <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">
                    Hace unas semanas te apuntaste a la lista de espera de IronRisk. Soy Ivan, el desarrollador en solitario del proyecto.
                </p>

                <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">
                    Perdona el silencio. He estado metido de lleno programando y probando la herramienta en mis propias cuentas de MT5 para asegurarme de que realmente funciona antes de mostrarla.
                </p>

                <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">
                    Acabo de subir una <strong style="color: #c9d1d9;">demo de 1 minuto</strong> mostrando como funciona el escudo visual en tiempo real para evitar cerrar en panico durante los drawdowns normales.
                </p>

                <p style="font-size: 16px; color: #8b949e; line-height: 1.6;">
                    Ahora mismo estoy buscando un <strong style="color: #00e676;">grupo muy reducido de traders sistematicos reales</strong> para que prueben la beta, intenten romperla y me den feedback brutal y honesto.
                </p>
            """
            cta_btn = "Ver la Demo de 1 min"
            reply_line = 'Si las mates y la logica te cuadran, responde con <strong style="color: #00e676;">"me apunto"</strong> y te activo la cuenta hoy.'
            ps_text = '<strong style="color: #c9d1d9;">P.D.</strong> — La herramienta detecto que una de mis estrategias con USDJPY tenia un Riesgo Ciego del 38% — una probabilidad real de que mi ventaja no existiera. Deje de confiar en ella en real. Ese es exactamente el tipo de decision que te ayuda a tomar antes de perder mas.'
            bug_text = '<strong style="color: #c9d1d9;">Linea directa:</strong> Una vez dentro, veras un <strong style="color: #00e676;">icono de bug abajo a la derecha</strong> en cada pantalla. Un toque y tu reporte me llega directo a Telegram — sin tickets, sin cola de soporte. Hablas con el desarrollador, no con un bot.'

        html_content = f"""
        <html>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 20px; background-color: #0d1117; background-image: linear-gradient(#0d1117, #0d1117); color: #c9d1d9;">
            <div style="max-width: 520px; margin: 0 auto; background-color: #161b22; background-image: linear-gradient(#161b22, #161b22); border: 1px solid #30363d; border-radius: 12px; padding: 40px;">
                <a href="https://www.ironrisk.pro" style="display: inline-block; margin-bottom: 10px;"><img src="https://www.ironrisk.pro/email-logo.png" alt="IronRisk" style="height: 36px; width: auto;" /></a>

                {body_paragraphs}

                <div style="text-align: center; margin: 35px 0;">
                    <a href="{demo_url}" 
                       style="display: inline-block; padding: 16px 32px; background-color: #00e676; color: #0d1117; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                       {cta_btn}
                    </a>
                </div>

                <p style="font-size: 16px; color: #c9d1d9; line-height: 1.6; text-align: center;">
                    {reply_line}
                </p>

                <div style="background-color: #1c2128; border: 1px solid #30363d; border-radius: 8px; padding: 16px; margin: 24px 0;">
                    <p style="font-size: 13px; color: #8b949e; margin: 0; line-height: 1.5;">
                        {ps_text}
                    </p>
                </div>

                <div style="background-color: #1c2128; border: 1px solid #00e67633; border-radius: 8px; padding: 16px; margin: 0 0 24px;">
                    <p style="font-size: 13px; color: #8b949e; margin: 0; line-height: 1.5;">
                        {bug_text}
                    </p>
                </div>

                <p style="font-size: 14px; color: #484f58; margin-top: 40px; border-top: 1px solid #30363d; padding-top: 20px;">
                    <strong style="color: #8b949e;">Ivan P.</strong> <span style="color: #484f58;">— Founder & Lead Developer</span><br>
                    <a href="https://www.ironrisk.pro" style="color: #00e676; text-decoration: none; font-size: 12px;">www.ironrisk.pro</a>
                </p>
            </div>
          </body>
        </html>
        """

        try:
            msg = EmailMessage()
            msg["Subject"] = subject
            sender_name = "Ivan from IronRisk" if locale == "en" else "Iván de IronRisk"
            msg["From"] = formataddr((sender_name, self.sender_email))
            msg["To"] = recipient_email
            msg.set_content("Update from IronRisk beta.")
            msg.add_alternative(html_content, subtype="html")

            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.sender_email, self.sender_password)
                server.send_message(msg)
            logger.info(f"Beta reactivation email sent to {recipient_email} ({locale})")
            return True
        except Exception as e:
            logger.error(f"Failed to send beta reactivation to {recipient_email}: {e}")
            return False

