from monitors.models import (
    CheckResult,
    Incident,
    Monitor,
)


def apply_check_result_state(
    monitor: Monitor,
    check_result: CheckResult,
) -> Incident | None:
    if check_result.monitor_id != monitor.pk:
        raise ValueError(
            "Check result does not belong to monitor.",
        )

    monitor.last_checked_at = check_result.checked_at

    if not monitor.enabled or monitor.status == Monitor.Status.PAUSED:
        monitor.save(
            update_fields=[
                "last_checked_at",
                "updated_at",
            ]
        )

        return None

    open_incident = (
        Incident.objects.select_for_update()
        .filter(
            monitor=monitor,
            resolved_at__isnull=True,
        )
        .first()
    )

    if check_result.result == CheckResult.Result.SUCCESS:
        monitor.consecutive_failures = 0
        monitor.consecutive_successes += 1

        if open_incident is None:
            monitor.status = Monitor.Status.UP

        elif monitor.consecutive_successes >= monitor.recovery_threshold:
            monitor.status = Monitor.Status.UP

            open_incident.resolved_at = check_result.checked_at

            open_incident.save(
                update_fields=[
                    "resolved_at",
                ],
            )

        else:
            monitor.status = Monitor.Status.DEGRADED

    else:
        monitor.consecutive_successes = 0
        monitor.consecutive_failures += 1

        if open_incident is not None:
            monitor.status = Monitor.Status.DOWN

        elif monitor.consecutive_failures >= monitor.failure_threshold:
            monitor.status = Monitor.Status.DOWN

            open_incident = Incident.objects.create(
                monitor=monitor,
                started_at=(check_result.checked_at),
            )

        else:
            monitor.status = Monitor.Status.DEGRADED

    monitor.save(
        update_fields=[
            "status",
            "consecutive_failures",
            "consecutive_successes",
            "last_checked_at",
            "updated_at",
        ]
    )

    return open_incident
