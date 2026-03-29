import sys

def check_quotes(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    in_string = False
    in_comment = False
    in_line_comment = False
    
    i = 0
    while i < len(content):
        c = content[i]
        
        if in_line_comment:
            if c == '\n':
                in_line_comment = False
            i += 1
            continue
            
        if in_comment:
            if c == '*' and i + 1 < len(content) and content[i+1] == '/':
                in_comment = False
                i += 2
                continue
            i += 1
            continue
            
        if in_string:
            if c == '\\':
                i += 2
                continue
            if c == '"':
                in_string = False
            i += 1
            continue
            
        if c == '"':
            in_string = True
            i += 1
            continue
            
        if c == '/' and i + 1 < len(content):
            if content[i+1] == '/':
                in_line_comment = True
                i += 2
                continue
            if content[i+1] == '*':
                in_comment = True
                i += 2
                continue
        i += 1

    if in_string:
        print("Unclosed string!")
    else:
        print("All strings are closed properly.")

check_quotes(sys.argv[1])
