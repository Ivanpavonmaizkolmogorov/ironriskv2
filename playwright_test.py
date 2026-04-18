import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Add a mock cookie/localStorage so we can reach dashboard
        context = await browser.new_context()
        page = await context.new_page()

        # Let's bypass login by mocking the API response or something?
        # Actually in next.js, the chunk files are listed in the HTML of the dashboard page even if you get a 307 redirect
        # Wait, if it redirects, we get the login chunks.
        # But Next.js manifest has all chunks!
        await page.goto("https://www.ironrisk.pro/es/login")
        urls = await page.evaluate("""
            Array.from(document.querySelectorAll('script')).map(s => s.src).filter(s => s.includes('_next/static/'))
        """)
        
        found = False
        for url in urls:
            resp = await page.goto(url)
            text = await resp.text()
            if "No se pudo cambiar el idioma" in text or "startTransition" in text:
                if "No se pudo cambiar el idioma" in text:
                    print(f"FOUND EXACT ALERT STRING in {url.split('/')[-1]}")
                    found = True
                    break
        if not found:
            print("Alert string not found. Checking chunk paths from build manifest...")
            
            # Fetch build manifest
            build_id_res = await page.goto("https://www.ironrisk.pro/_next/static/development/_buildManifest.js") # might be 404 in prod
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
