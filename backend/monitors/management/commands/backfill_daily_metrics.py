from django.core.management.base import (
    BaseCommand,
)

from monitors.services.metrics import (
    backfill_missing_daily_metrics,
)


class Command(BaseCommand):
    help = "Create missing DailyMetric rows from retained raw CheckResult data."

    def handle(self, *args, **options):
        created_count = backfill_missing_daily_metrics()

        self.stdout.write(self.style.SUCCESS((f"Created {created_count} daily metric row(s).")))
