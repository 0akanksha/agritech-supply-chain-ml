"""Fast, offline tests for the feature/label pipeline — no database or network required.
Feeds app.data.synthetic's generators into the pure build_feature_and_label_frame(...) from
app.data.features, the same function train.py/predict.py call with real Postgres data in
production (see features.py's module docstring)."""

import pandas as pd
import pytest
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import r2_score
from sklearn.model_selection import train_test_split

from app.data.features import (
    DRIVER_COLUMNS,
    FEATURE_COLUMNS,
    _future_volatility_label,
    build_feature_and_label_frame,
)
from app.data.synthetic import generate_ndvi, generate_prices, generate_weather
from app.reference_data import CROPS, REGIONS


def test_future_volatility_label_uses_only_future_data():
    price = pd.Series([100, 100, 100, 100, 130, 100, 100, 100])
    label = _future_volatility_label(price)

    # row 0's worst move over the next 4 weeks (100,100,100,130) is +30% -> label 100
    assert label.iloc[0] == pytest.approx(100.0)
    # the trailing LABEL_HORIZON_WEEKS rows have no future data available -> NaN, not 0
    assert label.iloc[-4:].isna().all()


def test_future_volatility_label_clips_at_100_not_beyond():
    price = pd.Series([100, 100, 100, 100, 250])  # a 150% move
    label = _future_volatility_label(price)
    assert label.iloc[0] == 100.0


def test_future_volatility_label_zero_for_flat_prices():
    price = pd.Series([100.0] * 8)
    label = _future_volatility_label(price)
    assert label.iloc[0] == pytest.approx(0.0)


@pytest.mark.parametrize("region", REGIONS, ids=lambda r: r.id)
@pytest.mark.parametrize("crop", CROPS, ids=lambda c: c.id)
def test_build_feature_and_label_frame_shape(region, crop):
    weather_df = generate_weather(region.id, days=104 * 7 + 60)
    ndvi_df = generate_ndvi(region.id, crop.id, weeks=104 + 8)
    price_df = generate_prices(region.id, crop.id, weeks=104 + 8)

    unlabeled = build_feature_and_label_frame(weather_df, ndvi_df, price_df, with_label=False)
    assert not unlabeled.empty
    assert unlabeled[FEATURE_COLUMNS].isna().sum().sum() == 0

    labeled = build_feature_and_label_frame(weather_df, ndvi_df, price_df, with_label=True)
    assert not labeled.empty
    assert labeled["bottleneck_risk"].between(0, 100).all()
    # labeling trims the most recent weeks, whose future isn't known yet
    assert len(labeled) < len(unlabeled)


def test_driver_columns_are_a_subset_of_features():
    assert set(DRIVER_COLUMNS).issubset(FEATURE_COLUMNS)
    assert "ndvi_level" not in DRIVER_COLUMNS


def test_model_learns_something_from_the_labeled_features():
    """Sanity check that the feature/label design is actually learnable — pools synthetic
    data across all regions for one crop and fits a plain RandomForest directly (no MLflow,
    no Postgres — those are exercised live, not in this offline suite)."""
    crop = CROPS[0]
    frames = []
    for region in REGIONS:
        weather_df = generate_weather(region.id, days=104 * 7 + 60)
        ndvi_df = generate_ndvi(region.id, crop.id, weeks=104 + 8)
        price_df = generate_prices(region.id, crop.id, weeks=104 + 8)
        frames.append(build_feature_and_label_frame(weather_df, ndvi_df, price_df, with_label=True))

    df = pd.concat(frames, ignore_index=True)
    X_train, X_test, y_train, y_test = train_test_split(
        df[FEATURE_COLUMNS], df["bottleneck_risk"], test_size=0.2, random_state=42
    )
    model = RandomForestRegressor(n_estimators=100, max_depth=6, random_state=42)
    model.fit(X_train, y_train)
    preds = model.predict(X_test)

    assert ((preds >= 0) & (preds <= 100)).all()
    assert r2_score(y_test, preds) > -1  # not a rigorous bar; catches a badly broken pipeline
