"""Package the first-party extension without build artifacts or dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
source = root / 'public' / 'kiosk-extension'
with ZipFile(root / 'public' / 'mathfinance-kiosk.zip', 'w', ZIP_DEFLATED) as archive:
    for path in sorted(source.iterdir()):
        if path.is_file():
            archive.write(path, path.name)
print('Packaged Math & Finance Kiosk')
