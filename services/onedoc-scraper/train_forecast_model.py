from forecasting import train_week_fill_model


if __name__ == "__main__":
    model = train_week_fill_model(lookback_weeks=26)
    print(
        "Forecast-Modell trainiert:",
        f"samples={model.get('total_samples', 0)}",
        f"entities={model.get('entities_trained', 0)}",
        f"global_daily_fill_rate={round(model.get('global_daily_fill_rate', 0.0), 4)}",
    )
