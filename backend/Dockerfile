FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt requirements-dev.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt
COPY . .

FROM base AS production
RUN python manage.py collectstatic --noinput \
    && useradd --create-home --uid 10001 pulsecheck \
    && chown -R pulsecheck:pulsecheck /app
USER pulsecheck
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60"]

FROM base AS development
RUN python -m pip install --no-cache-dir -r requirements-dev.txt
EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]