import paramiko
import time
import sys

HOST = '62.238.19.114'
USER = 'root'
OLD_PASSWORD = 'tiXPqb3nFagRwN7fvdWq'
NEW_PASSWORD = 'IronRisk_Production_2026!'

print("Connecting to change password...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    # Just try to connect
    ssh.connect(HOST, username=USER, password=OLD_PASSWORD)
    print("Connected successfully without auth exception.")
except paramiko.ssh_exception.AuthenticationException as e:
    # If the password expired, paramiko might throw AuthenticationException or BadAuthenticationType
    pass
except Exception as e:
    pass

# We must use paramiko's built-in support or transport directly
try:
    t = paramiko.Transport((HOST, 22))
    t.connect()
    # auth_password will fail with 'password change required' or similar if expired, but some versions of paramiko handle it differently.
    try:
        t.auth_password(USER, OLD_PASSWORD)
    except paramiko.ssh_exception.AuthenticationException as e:
        if 'password change required' not in str(e).lower() and 'bad authentication type' not in str(e).lower():
            pass
            
    # Try interactive session
    t = paramiko.Transport((HOST, 22))
    t.connect()
    t.auth_interactive_dummy = lambda title, inj: [(NEW_PASSWORD) if "new" in p.lower() else (OLD_PASSWORD) for p in inj]
    
except Exception as e:
    pass

print("Attempting sshpass approach or shell approach...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    # The error "WARNING: Your password has expired." actually happens DURIING normal exec_command.
    # Ah! paramiko ssh.connect() SUCCESSFUL! But exec_command fails with "Password change required".
    ssh.connect(HOST, username=USER, password=OLD_PASSWORD)
    
    chan = ssh.invoke_shell()
    time.sleep(1)
    out = chan.recv(9999).decode()
    if 'current' in out.lower() or 'password' in out.lower():
        print("Sending old password...")
        chan.send(OLD_PASSWORD + '\n')
        time.sleep(1)
        out = chan.recv(9999).decode()
        
    if 'new' in out.lower():
        print("Sending new password...")
        chan.send(NEW_PASSWORD + '\n')
        time.sleep(1)
        out = chan.recv(9999).decode()
        
        print("Retyping new password...")
        chan.send(NEW_PASSWORD + '\n')
        time.sleep(1)
        out = chan.recv(9999).decode()
        
    print("Result:", out)
    
    # Try running a command now
    stdin, stdout, stderr = ssh.exec_command("whoami")
    print("whoami:", stdout.read().decode())
    
except Exception as e:
    print("Error:", e)

