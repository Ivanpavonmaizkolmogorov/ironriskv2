"""
Regression tests for email service encoding and headers.
"""

from typing import List
from .base import TestResult

def test_unicode_sender_header() -> TestResult:
    """
    Ensure that accented characters in the sender name do not trigger RFC encoding crashes
    when formatted into an EmailMessage via formataddr.
    """
    from email.message import EmailMessage
    from email.utils import formataddr

    sender_name = "Iván de IronRisk"
    sender_email = "ironrisk.shield@gmail.com"
    
    try:
        msg = EmailMessage()
        msg['From'] = formataddr((sender_name, sender_email))
        
        # Verify that formataddr correctly generated RFC 2047 encoded base64/quoted-printable bytes string when serialized
        expected_substring = "=?utf-8?"
        val = msg.as_string()
        
        if expected_substring not in val:
            return TestResult(
                name="test_unicode_sender_header",
                group="email_service",
                passed=False,
                expected="valid RFC 2047 encoded string",
                actual=val,
                error="formataddr didn't encode the string as expected."
            )
            
        return TestResult(
            name="test_unicode_sender_header",
            group="email_service",
            passed=True
        )
    except Exception as e:
        return TestResult(
            name="test_unicode_sender_header",
            group="email_service",
            passed=False,
            error=str(e)
        )

def run_group() -> List[TestResult]:
    """Execute all email service regression tests."""
    return [
        test_unicode_sender_header(),
    ]
