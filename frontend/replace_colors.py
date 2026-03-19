import os

replacements = {
    "'#f5f5f7'": "'var(--foreground)'",
    "'#aaaaaa'": "'var(--muted-foreground)'",
    "'#86868b'": "'var(--muted-foreground)'",
    "bg-[#2c2c2e]": "bg-card",
    "bg-black/10": "bg-card/50",
    "bg-black/60": "bg-card/80",
    "'#3a3a3c'": "'var(--border)'",
    "'rgba(58, 58, 60, 0.6)'": "'var(--secondary)'",
    "'rgba(44, 44, 46, 0.8)'": "'var(--card)'",
    "'rgba(134, 134, 139, 0.8)'": "'var(--muted-foreground)'",
    "background: '#2c2c2e'": "background: 'var(--card)'",
    "bg-[#1c1c1e]": "bg-background",
    "border-[#3a3a3c]": "border-border",
    "text-[#f5f5f7]": "text-foreground",
    "text-[#86868b]": "text-muted-foreground",
    "isFav ? '#fbbf24' : '#f5f5f7'": "isFav ? '#fbbf24' : 'var(--foreground)'"
}

frontend_dir = r"c:\Users\natha\PycharmProjects\ProjetInfo\frontend"

for root, _, files in os.walk(frontend_dir):
    if 'node_modules' in root or '.next' in root:
        continue
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            filepath = os.path.join(root, file)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                new_content = content
                for k, v in replacements.items():
                    new_content = new_content.replace(k, v)
                    
                if new_content != content:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Updated {filepath}")
            except Exception as e:
                print(f"Error reading {filepath}: {e}")
