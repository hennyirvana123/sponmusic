import unittest

from app import create_app


class ContractTests(unittest.TestCase):
    def test_experiment_routes_are_separate(self):
        app = create_app()

        routes = {
            (route.path, method)
            for route in app.routes
            for method in (route.methods or [])
        }

        self.assertIn(
            ("/transcribe", "POST"),
            routes,
        )

        self.assertIn(
            ("/transcribe/{job_id}", "GET"),
            routes,
        )

        self.assertIn(
            ("/transcribe/{job_id}/download/{variant}", "GET"),
            routes,
        )

        self.assertIn(
            ("/health", "GET"),
            routes,
        )

    def test_model_is_lazy(self):
        from piano_amt import PianoAMT

        self.assertIsNone(
            PianoAMT().model
        )


if __name__ == "__main__":
    unittest.main()
