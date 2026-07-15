"""Sanity check for the train -> predict pipeline: every crop should produce a trained
artifact and every region/crop combination should yield a well-formed prediction."""

import pytest

from app.models.predict import predict
from app.models.train import train_all
from app.reference_data import CROPS, REGIONS


@pytest.fixture(scope="module", autouse=True)
def trained_models():
    train_all()


@pytest.mark.parametrize("region", REGIONS, ids=lambda r: r.id)
@pytest.mark.parametrize("crop", CROPS, ids=lambda c: c.id)
def test_predict_returns_valid_shape(region, crop):
    result = predict(region.id, crop.id)

    assert 0 <= result["riskScore"] <= 100
    assert result["riskLevel"] in {"low", "medium", "high"}
    assert result["daysToBottleneck"] is None or 3 <= result["daysToBottleneck"] <= 90
    assert result["explanation"]
    assert result["factors"]
    assert all(0 <= f["contribution"] <= 1 for f in result["factors"])
