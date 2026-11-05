from datetime import datetime

from pydantic import BaseModel, Field, HttpUrl, model_validator


class ConnectionCreate(BaseModel):
    website_id: int
    connector_type: str = Field(default="wordpress", pattern="^(wordpress|custom|export)$")
    site_url: HttpUrl
    username: str = Field(default="", max_length=255)
    application_password: str = Field(default="", max_length=255)
    auto_publish: bool = False

    @model_validator(mode="after")
    def validate_by_type(self) -> "ConnectionCreate":
        if self.connector_type == "wordpress":
            if len(self.username.strip()) < 1:
                raise ValueError("WordPress username is required")
            if len(self.application_password.strip()) < 8:
                raise ValueError("WordPress application password is required")
        if self.connector_type == "custom":
            if len(self.application_password.strip()) < 8:
                raise ValueError("Custom connector API token is required")
        return self


class ConnectionUpdate(BaseModel):
    auto_publish: bool | None = None
    application_password: str | None = Field(default=None, max_length=255)
    username: str | None = None


class ConnectionOut(BaseModel):
    id: int
    website_id: int
    connector_type: str
    site_url: str
    username: str
    connection_status: str
    auto_publish: bool
    last_tested_at: datetime | None
    last_error: str | None
    created_at: datetime | None

    model_config = {"from_attributes": True}
