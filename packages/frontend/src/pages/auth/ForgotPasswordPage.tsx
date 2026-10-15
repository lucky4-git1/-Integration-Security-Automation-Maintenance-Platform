import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Card, Col, Container, Form, Row } from 'react-bootstrap';
import { authApi, getApiError } from '@/lib/api';

const schema = z.object({ email: z.string().email('Valid email required') });
type FormData = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setError('');
    try {
      await authApi.requestReset(data.email);
      setSent(true);
    } catch (err) {
      setError(getApiError(err));
    }
  };

  return (
    <Container className="py-5">
      <Row className="justify-content-center">
        <Col xs={12} sm={8} md={5}>
          <Card className="shadow-sm border-0">
            <Card.Body className="p-4">
              <h4 className="mb-3">Reset Password</h4>
              {sent ? (
                <Alert variant="success">
                  If that email exists, a reset link has been sent. Check your inbox.
                </Alert>
              ) : (
                <>
                  {error && <Alert variant="danger">{error}</Alert>}
                  <Form onSubmit={handleSubmit(onSubmit)}>
                    <Form.Group className="mb-3">
                      <Form.Label>Email address</Form.Label>
                      <Form.Control type="email" isInvalid={!!errors.email} {...register('email')} />
                      <Form.Control.Feedback type="invalid">{errors.email?.message}</Form.Control.Feedback>
                    </Form.Group>
                    <Button type="submit" variant="primary" className="w-100" disabled={isSubmitting}>
                      {isSubmitting ? 'Sending…' : 'Send Reset Link'}
                    </Button>
                  </Form>
                </>
              )}
              <div className="text-center mt-3">
                <Link to="/login" className="small">← Back to sign in</Link>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}
