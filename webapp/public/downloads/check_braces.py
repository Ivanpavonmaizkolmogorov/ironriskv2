import sys

def check_parens(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    stack = []
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
                
        if c == '(':
            l_no = content[:i].count('\n') + 1
            stack.append(('(', l_no))
        elif c == ')':
            l_no = content[:i].count('\n') + 1
            if not stack:
                print("Unmatched closing paren at line", l_no)
            else:
                top, line_no = stack.pop()
                while top != '(' and stack:
                    print("Mismatched block! Expected match for", top, "but got ) at line", l_no)
                    top, line_no = stack.pop()
                if top != '(':
                    print("Unmatched closing paren at line", l_no)
                    
        elif c == '{':
            l_no = content[:i].count('\n') + 1
            stack.append(('{', l_no))
        elif c == '}':
            l_no = content[:i].count('\n') + 1
            if not stack:
                print("Unmatched closing brace at line", l_no)
            else:
                top, line_no = stack.pop()
                while top != '{' and stack:
                    print("Mismatched block! Expected match for", top, "but got } at line", l_no)
                    top, line_no = stack.pop()
                if top != '{':
                    print("Unmatched closing brace at line", l_no)
        
        i += 1

    for s, line in stack:
        print("Unclosed", s, "starting at line", line)

check_parens(sys.argv[1])
