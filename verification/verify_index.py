import os
from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Mock /api/config-status
        page.route('**/api/config-status', lambda route: route.fulfill(
            status=200,
            content_type='application/json',
            body='{"status": "present", "format": "64-hex"}'
        ))

        # Mock /api/config-schema
        page.route('**/api/config-schema', lambda route: route.fulfill(
            status=200,
            content_type='application/json',
            body='{"fields": [{"name": "apiKey", "label": "Mock API Key Label", "type": "password", "required": true}]}'
        ))

        # Determine absolute path to index.html
        cwd = os.getcwd()
        file_path = f"file://{cwd}/src/public/index.html"

        page.goto(file_path)

        # Expect the page to load
        expect(page.get_by_text("Server Configuration")).to_be_visible()

        # Expect the form to load (after mocked fetch)
        # Use a unique label from the mock to avoid ambiguity
        expect(page.get_by_text("Mock API Key Label")).to_be_visible()

        # Take screenshot
        page.screenshot(path="verification/index_page.png")
        browser.close()

if __name__ == "__main__":
    run()
