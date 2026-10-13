from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("monitors", "0005_publicstatuspage")]

    operations = [
        migrations.AddField(
            model_name="monitor",
            name="config_version",
            field=models.PositiveIntegerField(default=1, editable=False),
        ),
        migrations.AddIndex(
            model_name="monitor",
            index=models.Index(
                fields=["enabled", "next_check_at"], name="monitor_due_idx"
            ),
        ),
        migrations.AlterField(
            model_name="checkresult",
            name="error_type",
            field=models.CharField(
                blank=True, null=True, max_length=30,
                choices=[
                    ("TIMEOUT", "Timeout"),
                    ("DNS_ERROR", "DNS error"),
                    ("CONNECTION_ERROR", "Connection error"),
                    ("SSL_ERROR", "SSL error"),
                    ("TOO_MANY_REDIRECTS", "Too many redirects"),
                    ("UNSAFE_TARGET", "Unsafe target"),
                ],
            ),
        ),
    ]