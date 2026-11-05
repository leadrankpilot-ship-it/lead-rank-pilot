"""Outbound email via SMTP (Gmail App Password)."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def smtp_configured() -> bool:
    return bool(settings.smtp_user.strip() and settings.smtp_password.strip())


def send_email(*, to: str, subject: str, text_body: str, html_body: str | None = None) -> None:
    if not smtp_configured():
        raise RuntimeError("SMTP is not configured")

    from_addr = settings.smtp_from.strip() or settings.smtp_user.strip()
    if settings.smtp_from_name.strip() and "<" not in from_addr:
        from_addr = f"{settings.smtp_from_name.strip()} <{from_addr}>"

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to
    msg.set_content(text_body)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    password = settings.smtp_password.replace(" ", "")
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(settings.smtp_user.strip(), password)
        smtp.send_message(msg)
    logger.info("Email sent to %s (%s)", to, subject)


def send_password_reset_email(*, to: str, reset_url: str) -> None:
    subject = "Reset your LeadRankPilot password"
    text_body = (
        "We received a request to reset your LeadRankPilot password.\n\n"
        f"Open this link to choose a new password (expires soon):\n{reset_url}\n\n"
        "If you did not request this, you can ignore this email.\n"
    )
    html_body = f"""\
<p>We received a request to reset your <strong>LeadRankPilot</strong> password.</p>
<p><a href="{reset_url}">Reset your password</a></p>
<p style="color:#6B7280;font-size:13px;">If you did not request this, you can ignore this email.</p>
"""
    send_email(to=to, subject=subject, text_body=text_body, html_body=html_body)
